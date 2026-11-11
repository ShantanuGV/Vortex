import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

const SIGNALING_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000' 
  : `http://${window.location.hostname}:5000`;

const DEFAULT_PAGE_SIZE = 6;

export function useWebRTC() {
  const [localStream, setLocalStream] = useState(null);
  
  // Full room participant directory (can hold 500+ users with negligible overhead)
  const [roster, setRoster] = useState({}); // peerId -> { peerId, userName, isAudioMuted, isVideoOff, isScreenSharing, isHandRaised, role }
  
  // Active media streams for visible peers (capped at 6-9 active decoders)
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> MediaStream
  
  // Scalable pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);

  // Media toggle states
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [userName, setUserName] = useState('');

  const socketRef = useRef(null);
  const peerConnections = useRef({}); // peerId -> RTCPeerConnection
  const screenTrackRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef({}); // peerId -> Array of RTCIceCandidate
  const audioContextRef = useRef(null);
  const vadIntervalRef = useRef(null);

  // Initialize or get Local MediaStream
  const getMediaStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.warn('[WebRTC] Camera/Mic access error, attempting audio fallback:', err);
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioOnlyStream;
        setLocalStream(audioOnlyStream);
        setIsVideoOff(true);
        return audioOnlyStream;
      } catch (audioErr) {
        console.error('[WebRTC] Could not acquire audio or video stream:', audioErr);
        const emptyStream = new MediaStream();
        localStreamRef.current = emptyStream;
        setLocalStream(emptyStream);
        setIsVideoOff(true);
        setIsAudioMuted(true);
        return emptyStream;
      }
    }
  }, []);

  // Voice Activity Detection (VAD) using Web Audio API AnalyserNode
  const startVAD = useCallback((stream) => {
    if (!stream || stream.getAudioTracks().length === 0) return;

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      vadIntervalRef.current = setInterval(() => {
        if (!socketRef.current || isAudioMuted) return;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(1, average / 128);

        if (normalized > 0.12) {
          socketRef.current.emit('speaking-level', { level: normalized });
        }
      }, 150);
    } catch (e) {
      console.warn('[VAD] Audio analyzer not available:', e);
    }
  }, [isAudioMuted]);

  // Clean up PeerConnection for a specific peer
  const cleanupPeer = useCallback((peerId) => {
    if (peerConnections.current[peerId]) {
      try {
        peerConnections.current[peerId].close();
      } catch (e) {
        console.error(e);
      }
      delete peerConnections.current[peerId];
    }
    delete pendingCandidates.current[peerId];
    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[peerId];
      return copy;
    });
  }, []);

  // Create PeerConnection (only invoked for visible page peers or active speaker)
  const createPeerConnection = useCallback((peerId, targetUserName) => {
    if (peerConnections.current[peerId]) {
      return peerConnections.current[peerId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[peerId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          targetPeerId: peerId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received track from ${targetUserName || peerId}:`, event.track.kind);
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => ({
        ...prev,
        [peerId]: remoteStream
      }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(peerId);
      }
    };

    return pc;
  }, [cleanupPeer]);

  const processPendingCandidates = useCallback(async (peerId) => {
    const pc = peerConnections.current[peerId];
    if (pc && pendingCandidates.current[peerId]) {
      while (pendingCandidates.current[peerId].length > 0) {
        const candidate = pendingCandidates.current[peerId].shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Error adding ICE candidate:', e);
        }
      }
    }
  }, []);

  // Compute visible peers based on pagination and active speaker
  const peerList = useMemo(() => Object.values(roster), [roster]);
  const totalPages = Math.max(1, Math.ceil(peerList.length / pageSize));

  const visiblePeerIds = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const pageSlice = peerList.slice(startIndex, startIndex + pageSize);
    const ids = new Set(pageSlice.map((p) => p.peerId));

    // If there is an active speaker not on this page, include them so audio/video stays live
    if (activeSpeakerId && roster[activeSpeakerId]) {
      ids.add(activeSpeakerId);
    }
    return ids;
  }, [peerList, currentPage, pageSize, activeSpeakerId, roster]);

  // Synchronize active WebRTC connections with visible page:
  // Connect to visible peers; teardown connections to peers that moved to hidden pages
  useEffect(() => {
    if (!isConnected || !socketRef.current) return;

    // 1. Establish connections to newly visible peers
    visiblePeerIds.forEach(async (peerId) => {
      if (!peerConnections.current[peerId]) {
        const peer = roster[peerId];
        const pc = createPeerConnection(peerId, peer?.userName);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current.emit('offer', {
            targetPeerId: peerId,
            sdp: offer
          });
        } catch (err) {
          console.error('[WebRTC] Selective subscription offer error:', err);
        }
      }
    });

    // 2. Disconnect peers that are no longer visible (to keep client CPU and RAM at minimum)
    Object.keys(peerConnections.current).forEach((peerId) => {
      if (!visiblePeerIds.has(peerId)) {
        cleanupPeer(peerId);
      }
    });
  }, [visiblePeerIds, isConnected, roster, createPeerConnection, cleanupPeer]);

  // Join Room
  const joinRoom = useCallback(async ({ roomId: targetRoomId, userName: name, initialAudioMuted = false, initialVideoOff = false }) => {
    setRoomId(targetRoomId);
    setUserName(name);
    setIsAudioMuted(initialAudioMuted);
    setIsVideoOff(initialVideoOff);

    let currentStream = localStreamRef.current;
    if (!currentStream) {
      currentStream = await getMediaStream();
    }

    if (currentStream) {
      currentStream.getAudioTracks().forEach((t) => (t.enabled = !initialAudioMuted));
      currentStream.getVideoTracks().forEach((t) => (t.enabled = !initialVideoOff));
      startVAD(currentStream);
    }

    const socket = io(SIGNALING_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[Socket] Connected to scalable signaling engine: ${socket.id}`);
      setIsConnected(true);

      socket.emit('join-room', {
        roomId: targetRoomId,
        userName: name,
        isAudioMuted: initialAudioMuted,
        isVideoOff: initialVideoOff
      });
    });

    // Initial Room Snapshot
    socket.on('room-snapshot', ({ participants }) => {
      console.log(`[Socket] Received room snapshot with ${participants.length} participants.`);
      const map = {};
      participants.forEach((p) => {
        if (p.peerId !== socket.id) {
          map[p.peerId] = p;
        }
      });
      setRoster(map);
    });

    // Batched Room Deltas (High-Scale optimization: processes 50ms batch in one render tick)
    socket.on('room-deltas', (deltas) => {
      setRoster((prev) => {
        const next = { ...prev };
        deltas.forEach((delta) => {
          if (delta.type === 'user-joined') {
            if (delta.participant.peerId !== socket.id) {
              next[delta.participant.peerId] = delta.participant;
            }
          } else if (delta.type === 'user-left') {
            delete next[delta.peerId];
            cleanupPeer(delta.peerId);
          } else if (delta.type === 'peer-media-toggle') {
            if (next[delta.peerId]) {
              next[delta.peerId] = {
                ...next[delta.peerId],
                isAudioMuted: delta.isAudioMuted,
                isVideoOff: delta.isVideoOff,
                role: delta.role
              };
            }
          } else if (delta.type === 'peer-screen-share') {
            if (next[delta.peerId]) {
              next[delta.peerId] = {
                ...next[delta.peerId],
                isScreenSharing: delta.isSharing
              };
            }
          } else if (delta.type === 'peer-raise-hand') {
            if (next[delta.peerId]) {
              next[delta.peerId] = {
                ...next[delta.peerId],
                isHandRaised: delta.isHandRaised
              };
            }
          } else if (delta.type === 'active-speaker-change') {
            if (delta.isSpeaking) {
              setActiveSpeakerId(delta.peerId);
            } else {
              setActiveSpeakerId((curr) => (curr === delta.peerId ? null : curr));
            }
          }
        });
        return next;
      });
    });

    // WebRTC Offer/Answer
    socket.on('offer', async ({ callerPeerId, sdp, userName: callerName }) => {
      const pc = createPeerConnection(callerPeerId, callerName);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await processPendingCandidates(callerPeerId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer', {
          targetPeerId: callerPeerId,
          sdp: answer
        });
      } catch (err) {
        console.error('[WebRTC] Offer handling error:', err);
      }
    });

    socket.on('answer', async ({ responderPeerId, sdp }) => {
      const pc = peerConnections.current[responderPeerId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await processPendingCandidates(responderPeerId);
        } catch (err) {
          console.error('[WebRTC] Answer handling error:', err);
        }
      }
    });

    socket.on('ice-candidate', async ({ senderPeerId, candidate }) => {
      const pc = peerConnections.current[senderPeerId];
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] ICE candidate error:', e);
        }
      } else {
        if (!pendingCandidates.current[senderPeerId]) {
          pendingCandidates.current[senderPeerId] = [];
        }
        pendingCandidates.current[senderPeerId].push(candidate);
      }
    });

    socket.on('new-chat-message', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });
  }, [createPeerConnection, cleanupPeer, processPendingCandidates, getMediaStream, startVAD]);

  // Audio Toggle
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !isAudioMuted;
        audioTracks.forEach((track) => (track.enabled = !nextState));
        setIsAudioMuted(nextState);

        if (socketRef.current) {
          socketRef.current.emit('toggle-media', {
            isAudioMuted: nextState,
            isVideoOff
          });
        }
      }
    }
  }, [isAudioMuted, isVideoOff]);

  // Video Toggle
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !isVideoOff;
        videoTracks.forEach((track) => (track.enabled = !nextState));
        setIsVideoOff(nextState);

        if (socketRef.current) {
          socketRef.current.emit('toggle-media', {
            isAudioMuted,
            isVideoOff: nextState
          });
        }
      }
    }
  }, [isAudioMuted, isVideoOff]);

  // Screen Share Toggle
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setIsScreenSharing(false);

      if (socketRef.current) {
        socketRef.current.emit('screen-share-status', { isSharing: false });
      }

      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
          }
        });
      }
    } else {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false
        });
        const screenTrack = displayStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;
        setIsScreenSharing(true);

        if (socketRef.current) {
          socketRef.current.emit('screen-share-status', { isSharing: true });
        }

        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        screenTrack.onended = () => {
          toggleScreenShare();
        };
      } catch (err) {
        console.warn('[WebRTC] Screen sharing cancelled:', err);
      }
    }
  }, [isScreenSharing]);

  // Raise Hand Toggle
  const toggleRaiseHand = useCallback(() => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    if (socketRef.current) {
      socketRef.current.emit('raise-hand', { isHandRaised: nextState });
    }
  }, [isHandRaised]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleAudio();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        toggleVideo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleAudio, toggleVideo]);

  // Send Chat Message
  const sendChatMessage = useCallback((message) => {
    if (!message || !message.trim()) return;
    if (socketRef.current) {
      socketRef.current.emit('send-chat', { message: message.trim() });
    }
  }, []);

  // Leave Room
  const leaveRoom = useCallback(() => {
    Object.keys(peerConnections.current).forEach((peerId) => cleanupPeer(peerId));

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setLocalStream(null);
    setRoster({});
    setRemoteStreams({});
    setIsConnected(false);
    setRoomId(null);
    setIsScreenSharing(false);
    setChatMessages([]);
  }, [cleanupPeer]);

  useEffect(() => {
    return () => leaveRoom();
  }, [leaveRoom]);

  // Scalability Telemetry
  const telemetry = useMemo(() => {
    const totalParticipants = 1 + Object.keys(roster).length;
    const activeStreams = Object.keys(remoteStreams).length;
    
    // In naive mesh: total streams = N * (N - 1)
    const theoreticalMeshStreams = totalParticipants * Math.max(0, totalParticipants - 1);
    const actualSubscribedStreams = activeStreams;
    const savingsPercent = theoreticalMeshStreams > 0 
      ? Math.max(0, ((1 - (actualSubscribedStreams / theoreticalMeshStreams)) * 100)).toFixed(1)
      : '0.0';

    return {
      totalParticipants,
      activeStreams,
      savingsPercent,
      page: currentPage,
      totalPages
    };
  }, [roster, remoteStreams, currentPage, totalPages]);

  return {
    localStream,
    roster,
    remoteStreams,
    visiblePeerIds,
    activeSpeakerId,
    currentPage,
    totalPages,
    setCurrentPage,
    telemetry,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    isHandRaised,
    chatMessages,
    isConnected,
    roomId,
    userName,
    getMediaStream,
    joinRoom,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    toggleRaiseHand,
    sendChatMessage,
    leaveRoom
  };
}
