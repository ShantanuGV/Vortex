import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || (
  typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin)
    : 'http://localhost:5000'
);

const DEFAULT_PAGE_SIZE = 6;

export function useWebRTC() {
  const [localStream, setLocalStream] = useState(null);
  const [roster, setRoster] = useState({});
  const [remoteStreams, setRemoteStreams] = useState({});
  
  // Authority & Meeting Settings (Admin controls)
  const [isHost, setIsHost] = useState(false);
  const [hostId, setHostId] = useState(null);
  const [roomSettings, setRoomSettings] = useState({
    isLocked: false,
    allowScreenShare: true,
    allowChat: true,
    allowMic: true,
    allowCamera: true
  });

  // Personal Settings (Persisted locally)
  const [personalSettings, setPersonalSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('gmeet_personal_settings');
      return saved ? JSON.parse(saved) : {
        audioInputDeviceId: '',
        audioOutputDeviceId: '',
        videoInputDeviceId: '',
        sendResolution: '720p',
        receiveResolution: 'auto',
        framerate: 30,
        noiseCancellation: true,
        echoCancellation: true,
        autoGainControl: true,
        mirrorVideo: true,
        lightingBoost: false,
        backgroundEffect: 'none', // 'none' | 'slight-blur' | 'heavy-blur'
        defaultAudioMuted: false,
        defaultVideoOff: false
      };
    } catch {
      return {
        sendResolution: '720p',
        receiveResolution: 'auto',
        framerate: 30,
        noiseCancellation: true,
        echoCancellation: true,
        autoGainControl: true,
        mirrorVideo: true,
        lightingBoost: false,
        backgroundEffect: 'none'
      };
    }
  });

  // Scalable pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [micVolume, setMicVolume] = useState(0); // 0 to 1 for live meter

  // Media toggle states
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [userName, setUserName] = useState('');

  // Host Admission / Waiting Room states
  const [isWaitingForAdmission, setIsWaitingForAdmission] = useState(false);
  const [admissionStatus, setAdmissionStatus] = useState(null); // null | 'waiting' | 'denied'
  const [deniedReason, setDeniedReason] = useState('');
  const [waitingPeers, setWaitingPeers] = useState([]); // Array of { peerId, userName, requestedAt }

  const socketRef = useRef(null);
  const peerConnections = useRef({}); // peerId -> RTCPeerConnection
  const remoteStreamsRef = useRef({}); // peerId -> MediaStream (persistent)
  const screenTrackRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef({}); // peerId -> Array of RTCIceCandidate
  const audioContextRef = useRef(null);
  const vadIntervalRef = useRef(null);

  // Initialize or acquire Local MediaStream with resolution constraints
  const getMediaStream = useCallback(async (overrides = {}) => {
    const settings = { ...personalSettings, ...overrides };
    
    let videoConstraints = {
      facingMode: 'user',
      frameRate: { ideal: settings.framerate || 30 }
    };

    if (settings.sendResolution === '360p') {
      videoConstraints.width = { ideal: 640 };
      videoConstraints.height = { ideal: 360 };
    } else if (settings.sendResolution === '180p') {
      videoConstraints.width = { ideal: 320 };
      videoConstraints.height = { ideal: 180 };
    } else {
      videoConstraints.width = { ideal: 1280 };
      videoConstraints.height = { ideal: 720 };
    }

    if (settings.videoInputDeviceId) {
      videoConstraints.deviceId = { exact: settings.videoInputDeviceId };
    }

    const audioConstraints = {
      echoCancellation: settings.echoCancellation ?? true,
      noiseSuppression: settings.noiseCancellation ?? true,
      autoGainControl: settings.autoGainControl ?? true
    };
    if (settings.audioInputDeviceId) {
      audioConstraints.deviceId = { exact: settings.audioInputDeviceId };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.warn('[WebRTC] Camera/Mic access warning, attempting audio-only fallback:', err);
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
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
  }, [personalSettings]);

  // Voice Activity Detection (VAD) & Live Mic Volume Meter
  const startVAD = useCallback((stream) => {
    if (!stream || stream.getAudioTracks().length === 0) return;

    try {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);

      vadIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(1, average / 100);

        setMicVolume(isAudioMuted ? 0 : normalized);

        if (!socketRef.current || isAudioMuted) return;

        if (normalized > 0.15) {
          socketRef.current.emit('speaking-level', { level: normalized });
        }
      }, 100);
    } catch (e) {
      console.warn('[VAD] Audio analyzer unavailable:', e);
    }
  }, [isAudioMuted]);

  // Clean up PeerConnection
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
    delete remoteStreamsRef.current[peerId];
    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[peerId];
      return copy;
    });
  }, []);

  // Process queued ICE candidates after remote description is established
  const processPendingCandidates = useCallback(async (peerId) => {
    const pc = peerConnections.current[peerId];
    if (pc && pc.remoteDescription && pendingCandidates.current[peerId]) {
      const candidates = pendingCandidates.current[peerId];
      pendingCandidates.current[peerId] = [];
      for (const candidate of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] ICE candidate error:', e);
        }
      }
    }
  }, []);

  // Create PeerConnection with Stable Multi-Track Streaming
  const createPeerConnection = useCallback((peerId, targetUserName) => {
    if (peerConnections.current[peerId]) {
      return peerConnections.current[peerId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[peerId] = pc;

    // Attach local stream tracks to PC
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

    // Stable Multi-Track Handler: Creates or updates persistent MediaStream
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received ${event.track.kind} track from ${targetUserName || peerId}`);
      
      let peerStream = remoteStreamsRef.current[peerId];
      if (!peerStream) {
        peerStream = new MediaStream();
        remoteStreamsRef.current[peerId] = peerStream;
      }

      // Add track to persistent stream
      peerStream.addTrack(event.track);

      // Force React state update by creating a new MediaStream container with all tracks
      const updatedStream = new MediaStream(peerStream.getTracks());
      setRemoteStreams((prev) => ({
        ...prev,
        [peerId]: updatedStream
      }));

      event.track.onunmute = () => {
        setRemoteStreams((prev) => ({
          ...prev,
          [peerId]: new MediaStream(peerStream.getTracks())
        }));
      };
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection with ${peerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(peerId);
      }
    };

    return pc;
  }, [cleanupPeer]);

  // Compute visible peers based on pagination and active speaker
  const peerList = useMemo(() => Object.values(roster), [roster]);
  const totalPages = Math.max(1, Math.ceil(peerList.length / pageSize));

  const visiblePeerIds = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const pageSlice = peerList.slice(startIndex, startIndex + pageSize);
    const ids = new Set(pageSlice.map((p) => p.peerId));

    if (activeSpeakerId && roster[activeSpeakerId]) {
      ids.add(activeSpeakerId);
    }
    return ids;
  }, [peerList, currentPage, pageSize, activeSpeakerId, roster]);

  // Synchronize active WebRTC connections with visible page
  // Uses Deterministic Initiator (socket.id < peerId) to eliminate SDP glare collisions!
  useEffect(() => {
    if (!isConnected || !socketRef.current) return;

    visiblePeerIds.forEach(async (peerId) => {
      if (!peerConnections.current[peerId]) {
        const peer = roster[peerId];
        const pc = createPeerConnection(peerId, peer?.userName);

        // Deterministic Initiator: Only the peer with lower socket ID initiates the offer
        const shouldInitiate = socketRef.current.id < peerId;
        if (shouldInitiate) {
          try {
            console.log(`[WebRTC] Initiating offer to ${peerId} (socket.id is lower)`);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current.emit('offer', {
              targetPeerId: peerId,
              sdp: offer
            });
          } catch (err) {
            console.error('[WebRTC] Offer initiation error:', err);
          }
        }
      }
    });

    // Cleanup peers that left the visible page
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

    let startMuted = initialAudioMuted || personalSettings.defaultAudioMuted;
    let startVideoOff = initialVideoOff || personalSettings.defaultVideoOff;

    setIsAudioMuted(startMuted);
    setIsVideoOff(startVideoOff);

    let currentStream = localStreamRef.current;
    if (!currentStream) {
      currentStream = await getMediaStream();
    }

    if (currentStream) {
      currentStream.getAudioTracks().forEach((t) => (t.enabled = !startMuted));
      currentStream.getVideoTracks().forEach((t) => (t.enabled = !startVideoOff));
      startVAD(currentStream);
    }

    const socket = io(SIGNALING_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[Socket] Connected to signaling engine: ${socket.id}`);
      setIsConnected(true);

      socket.emit('join-room', {
        roomId: targetRoomId,
        userName: name,
        isAudioMuted: startMuted,
        isVideoOff: startVideoOff
      });
    });

    // Waiting for host admission
    socket.on('waiting-for-admission', ({ message }) => {
      console.log('[Admission] Waiting for host approval:', message);
      setIsWaitingForAdmission(true);
      setAdmissionStatus('waiting');
    });

    // Host denied request
    socket.on('join-denied', ({ message }) => {
      console.log('[Admission] Request was denied by host:', message);
      setIsWaitingForAdmission(false);
      setAdmissionStatus('denied');
      setDeniedReason(message || 'The host declined your request to join.');
    });

    // Knocking notification for Host
    socket.on('participant-knock', ({ peerId, userName, requestedAt }) => {
      console.log(`[Admission] New participant knocking: ${userName} (${peerId})`);
      setWaitingPeers((prev) => {
        const filtered = prev.filter((p) => p.peerId !== peerId);
        return [...filtered, { peerId, userName, requestedAt }];
      });
    });

    // Knock handled
    socket.on('knock-handled', ({ peerId }) => {
      setWaitingPeers((prev) => prev.filter((p) => p.peerId !== peerId));
    });

    // Knock cancelled
    socket.on('knock-cancelled', ({ peerId }) => {
      setWaitingPeers((prev) => prev.filter((p) => p.peerId !== peerId));
    });

    // Knock all handled
    socket.on('knock-all-handled', () => {
      setWaitingPeers([]);
    });

    // Room Snapshot with Admin & Authority state
    socket.on('room-snapshot', ({ participants, isHost: hostStatus, hostId: currentHostId, settings, waitingList }) => {
      setIsWaitingForAdmission(false);
      setAdmissionStatus(null);
      setIsHost(hostStatus);
      setHostId(currentHostId);
      if (settings) {
        setRoomSettings(settings);
      }
      if (waitingList) {
        setWaitingPeers(waitingList);
      }

      const map = {};
      participants.forEach((p) => {
        if (p.peerId !== socket.id) {
          map[p.peerId] = p;
        }
      });
      setRoster(map);
    });

    // Room Settings Updated by Host
    socket.on('room-settings-updated', ({ settings, updatedBy }) => {
      setRoomSettings(settings);
      console.log(`[Admin] Room settings updated by ${updatedBy}:`, settings);
    });

    // Host Force Actions
    socket.on('force-mute-audio', () => {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
      }
      setIsAudioMuted(true);
      alert('Your microphone was muted by the meeting host.');
    });

    socket.on('force-disable-video', () => {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = false));
      }
      setIsVideoOff(true);
      alert('Your video camera was disabled by the meeting host.');
    });

    socket.on('kicked-from-room', ({ reason }) => {
      alert(reason || 'You were removed from the meeting by the host.');
      leaveRoom();
    });

    socket.on('meeting-ended-by-host', ({ message }) => {
      alert(message || 'The meeting was ended for everyone by the host.');
      leaveRoom();
    });

    socket.on('host-changed', ({ newHostId, newHostName }) => {
      setHostId(newHostId);
      const amIHost = socket.id === newHostId;
      setIsHost(amIHost);
      if (amIHost) {
        alert('You are now the meeting host.');
      } else {
        console.log(`Host changed to ${newHostName}`);
      }
    });

    socket.on('admin-warning', ({ message }) => {
      alert(message);
    });

    socket.on('join-error', ({ message }) => {
      alert(message);
      leaveRoom();
    });

    // Batched Room Deltas
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

    // WebRTC Offer Handler with Glare Recovery
    socket.on('offer', async ({ callerPeerId, sdp, userName: callerName }) => {
      console.log(`[WebRTC] Received offer from ${callerName} (${callerPeerId})`);
      const pc = createPeerConnection(callerPeerId, callerName);

      try {
        // If an offer collision occurs (glare)
        if (pc.signalingState !== 'stable') {
          console.warn(`[WebRTC] Glare detected on offer from ${callerPeerId}, state: ${pc.signalingState}`);
          if (socket.id < callerPeerId) {
            console.log('[WebRTC] Impolite peer ignoring incoming offer');
            return;
          }
          await pc.setLocalDescription({ type: 'rollback' });
        }

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

    // WebRTC Answer Handler
    socket.on('answer', async ({ responderPeerId, sdp }) => {
      console.log(`[WebRTC] Received answer from ${responderPeerId}`);
      const pc = peerConnections.current[responderPeerId];
      if (pc) {
        try {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            await processPendingCandidates(responderPeerId);
          } else {
            console.warn(`[WebRTC] Received answer in unexpected state: ${pc.signalingState}`);
          }
        } catch (err) {
          console.error('[WebRTC] Answer error:', err);
        }
      }
    });

    // ICE Candidate Handler with Buffering
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
  }, [createPeerConnection, cleanupPeer, processPendingCandidates, getMediaStream, startVAD, personalSettings]);

  // Audio Toggle with Host Policy Check
  const toggleAudio = useCallback(() => {
    if (!isHost && !roomSettings.allowMic && isAudioMuted) {
      alert('Microphones are locked by the host.');
      return;
    }

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
  }, [isAudioMuted, isVideoOff, isHost, roomSettings.allowMic]);

  // Video Toggle with Host Policy Check
  const toggleVideo = useCallback(() => {
    if (!isHost && !roomSettings.allowCamera && isVideoOff) {
      alert('Cameras are locked by the host.');
      return;
    }

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
  }, [isAudioMuted, isVideoOff, isHost, roomSettings.allowCamera]);

  // Screen Share Toggle with Host Policy Check
  const toggleScreenShare = useCallback(async () => {
    if (!isHost && !roomSettings.allowScreenShare && !isScreenSharing) {
      alert('Screen sharing is restricted to meeting hosts.');
      return;
    }

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
  }, [isScreenSharing, isHost, roomSettings.allowScreenShare]);

  // Raise Hand
  const toggleRaiseHand = useCallback(() => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    if (socketRef.current) {
      socketRef.current.emit('raise-hand', { isHandRaised: nextState });
    }
  }, [isHandRaised]);

  // Send Chat with Host Policy Check
  const sendChatMessage = useCallback((message) => {
    if (!message || !message.trim()) return;
    if (!isHost && !roomSettings.allowChat) {
      alert('In-call chat is turned off by the host.');
      return;
    }
    if (socketRef.current) {
      socketRef.current.emit('send-chat', { message: message.trim() });
    }
  }, [isHost, roomSettings.allowChat]);

  // --- Admin Host Controls ---

  const updateRoomSettings = useCallback((newSettings) => {
    if (!isHost) return;
    setRoomSettings(newSettings);
    if (socketRef.current) {
      socketRef.current.emit('update-room-settings', { settings: newSettings });
    }
  }, [isHost]);

  const hostMuteAll = useCallback(() => {
    if (!isHost) return;
    if (socketRef.current) {
      socketRef.current.emit('host-mute-all');
    }
  }, [isHost]);

  const hostMutePeer = useCallback((targetPeerId) => {
    if (!isHost) return;
    if (socketRef.current) {
      socketRef.current.emit('host-mute-peer', { targetPeerId });
    }
  }, [isHost]);

  const hostKickPeer = useCallback((targetPeerId) => {
    if (!isHost) return;
    if (socketRef.current) {
      socketRef.current.emit('host-kick-peer', { targetPeerId });
    }
  }, [isHost]);

  const hostEndMeeting = useCallback(() => {
    if (!isHost) return;
    if (socketRef.current) {
      socketRef.current.emit('host-end-meeting');
    }
  }, [isHost]);

  // Host Admission actions
  const admitPeer = useCallback((targetPeerId) => {
    if (!isHost) return;
    if (socketRef.current) {
      socketRef.current.emit('admit-peer', { targetPeerId });
    }
  }, [isHost]);

  const denyPeer = useCallback((targetPeerId) => {
    if (!isHost) return;
    if (socketRef.current) {
      socketRef.current.emit('deny-peer', { targetPeerId });
    }
  }, [isHost]);

  const admitAllPeers = useCallback(() => {
    if (!isHost) return;
    if (socketRef.current) {
      socketRef.current.emit('admit-all-peers');
    }
  }, [isHost]);

  // Waiting participant action
  const cancelWaiting = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('cancel-waiting');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsWaitingForAdmission(false);
    setAdmissionStatus(null);
  }, []);

  // --- Personal Settings Updates ---

  const updatePersonalSettings = useCallback(async (partial) => {
    const updated = { ...personalSettings, ...partial };
    setPersonalSettings(updated);
    try {
      localStorage.setItem('gmeet_personal_settings', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save personal settings to localStorage:', e);
    }

    // Dynamic hardware or resolution switch
    if (
      partial.audioInputDeviceId !== undefined ||
      partial.videoInputDeviceId !== undefined ||
      partial.sendResolution !== undefined ||
      partial.framerate !== undefined ||
      partial.noiseCancellation !== undefined ||
      partial.echoCancellation !== undefined
    ) {
      const newStream = await getMediaStream(updated);
      if (newStream) {
        newStream.getAudioTracks().forEach((t) => (t.enabled = !isAudioMuted));
        newStream.getVideoTracks().forEach((t) => (t.enabled = !isVideoOff));

        const newVideoTrack = newStream.getVideoTracks()[0];
        const newAudioTrack = newStream.getAudioTracks()[0];

        Object.values(peerConnections.current).forEach((pc) => {
          if (newVideoTrack) {
            const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
            if (videoSender) videoSender.replaceTrack(newVideoTrack);
          }
          if (newAudioTrack) {
            const audioSender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
            if (audioSender) audioSender.replaceTrack(newAudioTrack);
          }
        });
      }
    }
  }, [personalSettings, getMediaStream, isAudioMuted, isVideoOff]);

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
    setIsWaitingForAdmission(false);
    setAdmissionStatus(null);
    setWaitingPeers([]);
  }, [cleanupPeer]);

  useEffect(() => {
    return () => leaveRoom();
  }, [leaveRoom]);

  // Scalability Telemetry
  const telemetry = useMemo(() => {
    const totalParticipants = 1 + Object.keys(roster).length;
    const activeStreams = Object.keys(remoteStreams).length;
    const theoreticalMeshStreams = totalParticipants * Math.max(0, totalParticipants - 1);
    const savingsPercent = theoreticalMeshStreams > 0 
      ? Math.max(0, ((1 - (activeStreams / theoreticalMeshStreams)) * 100)).toFixed(1)
      : '0.0';

    return {
      totalParticipants,
      activeStreams,
      savingsPercent,
      page: currentPage,
      totalPages,
      isHost
    };
  }, [roster, remoteStreams, currentPage, totalPages, isHost]);

  return {
    localStream,
    roster,
    remoteStreams,
    visiblePeerIds,
    activeSpeakerId,
    micVolume,
    currentPage,
    totalPages,
    setCurrentPage,
    telemetry,
    // Authority & Settings
    isHost,
    hostId,
    roomSettings,
    personalSettings,
    updateRoomSettings,
    hostMuteAll,
    hostMutePeer,
    hostKickPeer,
    hostEndMeeting,
    // Host Admission / Waiting Room
    isWaitingForAdmission,
    admissionStatus,
    deniedReason,
    waitingPeers,
    admitPeer,
    denyPeer,
    admitAllPeers,
    cancelWaiting,
    updatePersonalSettings,
    // Media Controls
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
