import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// URL pointing to the signaling server (port 5000)
const SIGNALING_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000' 
  : `http://${window.location.hostname}:5000`;

export function useWebRTC() {
  const [localStream, setLocalStream] = useState(null);
  const [remotePeers, setRemotePeers] = useState({}); // peerId -> { peerId, userName, stream, isAudioMuted, isVideoOff, isScreenSharing, isHandRaised }
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
      console.warn('[WebRTC] Camera/Mic access error, attempting audio-only or blank stream:', err);
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

  // Helper to create PeerConnection
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

    // ICE Candidate event
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          targetPeerId: peerId,
          candidate: event.candidate
        });
      }
    };

    // Remote Track event
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track from ${peerId}:`, event.track.kind);
      const [remoteStream] = event.streams;
      setRemotePeers((prev) => {
        const existing = prev[peerId] || { peerId, userName: targetUserName || 'Participant' };
        return {
          ...prev,
          [peerId]: {
            ...existing,
            stream: remoteStream
          }
        };
      });
    };

    // Connection state logging
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${peerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(peerId);
      }
    };

    return pc;
  }, []);

  // Cleanup a specific peer
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
    setRemotePeers((prev) => {
      const updated = { ...prev };
      delete updated[peerId];
      return updated;
    });
  }, []);

  // Process any queued ICE candidates once remote description is set
  const processPendingCandidates = useCallback(async (peerId) => {
    const pc = peerConnections.current[peerId];
    if (pc && pendingCandidates.current[peerId]) {
      while (pendingCandidates.current[peerId].length > 0) {
        const candidate = pendingCandidates.current[peerId].shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Error adding queued ICE candidate:', e);
        }
      }
    }
  }, []);

  // Join Room
  const joinRoom = useCallback(async ({ roomId: targetRoomId, userName: name, initialAudioMuted = false, initialVideoOff = false }) => {
    setRoomId(targetRoomId);
    setUserName(name);
    setIsAudioMuted(initialAudioMuted);
    setIsVideoOff(initialVideoOff);

    // Ensure we have local stream
    let currentStream = localStreamRef.current;
    if (!currentStream) {
      currentStream = await getMediaStream();
    }

    if (currentStream) {
      currentStream.getAudioTracks().forEach((t) => (t.enabled = !initialAudioMuted));
      currentStream.getVideoTracks().forEach((t) => (t.enabled = !initialVideoOff));
    }

    // Connect Socket.io
    const socket = io(SIGNALING_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[Socket] Connected to signaling server with ID: ${socket.id}`);
      setIsConnected(true);

      socket.emit('join-room', {
        roomId: targetRoomId,
        userName: name,
        isAudioMuted: initialAudioMuted,
        isVideoOff: initialVideoOff
      });
    });

    // 1. Existing peers list received -> Initiate calls to them
    socket.on('all-peers', async (existingPeers) => {
      console.log('[Socket] Existing peers in room:', existingPeers);
      for (const peer of existingPeers) {
        setRemotePeers((prev) => ({
          ...prev,
          [peer.peerId]: {
            peerId: peer.peerId,
            userName: peer.userName,
            stream: null,
            isAudioMuted: peer.isAudioMuted,
            isVideoOff: peer.isVideoOff
          }
        }));

        const pc = createPeerConnection(peer.peerId, peer.userName);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', {
            targetPeerId: peer.peerId,
            sdp: offer
          });
        } catch (err) {
          console.error('[WebRTC] Failed to create offer for peer:', peer.peerId, err);
        }
      }
    });

    // 2. A new peer joined -> register them
    socket.on('user-joined', ({ peerId, userName: newUserName, isAudioMuted: muted, isVideoOff: vOff }) => {
      console.log(`[Socket] New user joined: ${newUserName} (${peerId})`);
      setRemotePeers((prev) => ({
        ...prev,
        [peerId]: {
          peerId,
          userName: newUserName,
          stream: null,
          isAudioMuted: muted,
          isVideoOff: vOff
        }
      }));
      // Prepare PC so it is ready when they send the offer
      createPeerConnection(peerId, newUserName);
    });

    // 3. Receive SDP Offer
    socket.on('offer', async ({ callerPeerId, sdp, userName: callerName }) => {
      console.log(`[WebRTC] Received offer from ${callerName} (${callerPeerId})`);
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
        console.error('[WebRTC] Failed to handle offer from peer:', callerPeerId, err);
      }
    });

    // 4. Receive SDP Answer
    socket.on('answer', async ({ responderPeerId, sdp }) => {
      console.log(`[WebRTC] Received answer from ${responderPeerId}`);
      const pc = peerConnections.current[responderPeerId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await processPendingCandidates(responderPeerId);
        } catch (err) {
          console.error('[WebRTC] Failed to set remote answer:', err);
        }
      }
    });

    // 5. Receive ICE Candidate
    socket.on('ice-candidate', async ({ senderPeerId, candidate }) => {
      const pc = peerConnections.current[senderPeerId];
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Error adding ICE candidate:', e);
        }
      } else {
        if (!pendingCandidates.current[senderPeerId]) {
          pendingCandidates.current[senderPeerId] = [];
        }
        pendingCandidates.current[senderPeerId].push(candidate);
      }
    });

    // 6. Media status toggle from remote peer
    socket.on('peer-media-toggle', ({ peerId, isAudioMuted: muted, isVideoOff: vOff }) => {
      setRemotePeers((prev) => {
        if (!prev[peerId]) return prev;
        return {
          ...prev,
          [peerId]: {
            ...prev[peerId],
            isAudioMuted: muted,
            isVideoOff: vOff
          }
        };
      });
    });

    // 7. Remote Screen Share toggle
    socket.on('peer-screen-share', ({ peerId, isSharing }) => {
      setRemotePeers((prev) => {
        if (!prev[peerId]) return prev;
        return {
          ...prev,
          [peerId]: {
            ...prev[peerId],
            isScreenSharing: isSharing
          }
        };
      });
    });

    // 8. Remote Hand Raise toggle
    socket.on('peer-raise-hand', ({ peerId, isHandRaised: raised }) => {
      setRemotePeers((prev) => {
        if (!prev[peerId]) return prev;
        return {
          ...prev,
          [peerId]: {
            ...prev[peerId],
            isHandRaised: raised
          }
        };
      });
    });

    // 9. In-call Chat Message
    socket.on('new-chat-message', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    // 10. Peer Left
    socket.on('user-left', ({ peerId, userName: leftUser }) => {
      console.log(`[Socket] User left: ${leftUser} (${peerId})`);
      cleanupPeer(peerId);
    });
  }, [createPeerConnection, cleanupPeer, processPendingCandidates, getMediaStream]);

  // Audio Toggle
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !isAudioMuted;
        audioTracks.forEach((track) => {
          track.enabled = !nextState;
        });
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
        videoTracks.forEach((track) => {
          track.enabled = !nextState;
        });
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
      // Stop screen sharing and revert back to webcam track
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setIsScreenSharing(false);

      if (socketRef.current) {
        socketRef.current.emit('screen-share-status', { isSharing: false });
      }

      // Revert sender track to camera track
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

        // Replace track on all peer connections
        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        // Listen for browser "Stop sharing" button click
        screenTrack.onended = () => {
          toggleScreenShare();
        };
      } catch (err) {
        console.warn('[WebRTC] Screen sharing cancelled or denied:', err);
      }
    }
  }, [isScreenSharing]);

  // Send Chat Message
  const sendChatMessage = useCallback((message) => {
    if (!message || !message.trim()) return;
    if (socketRef.current) {
      socketRef.current.emit('send-chat', { message: message.trim() });
    }
  }, []);

  // Leave Room
  const leaveRoom = useCallback(() => {
    // Close peer connections
    Object.keys(peerConnections.current).forEach((peerId) => {
      cleanupPeer(peerId);
    });

    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setLocalStream(null);
    setRemotePeers({});
    setIsConnected(false);
    setRoomId(null);
    setIsScreenSharing(false);
    setChatMessages([]);
  }, [cleanupPeer]);

  // Raise Hand Toggle
  const toggleRaiseHand = useCallback(() => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    if (socketRef.current) {
      socketRef.current.emit('raise-hand', { isHandRaised: nextState });
    }
  }, [isHandRaised]);

  // Global Keyboard Shortcuts (Ctrl+D = Mic, Ctrl+E = Camera)
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

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  return {
    localStream,
    remotePeers,
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

