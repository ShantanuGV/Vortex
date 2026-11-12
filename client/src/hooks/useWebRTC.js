import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { Device } from 'mediasoup-client';

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
  const [remoteScreenStreams, setRemoteScreenStreams] = useState({}); // Dedicated screen streams (BUG-005)

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

  // Enterprise WebRTC & SFU Transport Diagnostics
  const [networkStats, setNetworkStats] = useState({
    quality: 'excellent', // 'excellent' | 'good' | 'fair' | 'poor'
    rttMs: 0,
    packetLossPct: 0,
    jitterMs: 0
  });

  // Toast Notification Pipeline
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
        backgroundEffect: 'none',
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
  const [pinnedPeerId, setPinnedPeerId] = useState(null);
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

  // ---------------------------------------------------------------------------
  // STABLE MEDIASOUP REFS & MAPS (Held strictly outside the React render cycle)
  // ---------------------------------------------------------------------------
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef = useRef(new Map()); // 'audio' | 'video' | 'screen' -> Producer
  const consumersRef = useRef(new Map()); // consumerId -> { consumer, peerId, kind, producerId, appData }
  const peerMediaStreamsRef = useRef(new Map()); // peerId -> MediaStream (STABLE: camera & mic)
  const peerScreenStreamsRef = useRef(new Map()); // peerId -> MediaStream (STABLE: dedicated screen share - BUG-005)
  const consumingProducersRef = useRef(new Set()); // In-flight consume guards to eliminate race conditions (BUG-002)
  const pendingProducersQueue = useRef([]); // Producer payloads queued before recvTransport is ready
  const localStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const vadIntervalRef = useRef(null);
  const hostSecretRef = useRef(null);

  // Acquire Local MediaStream
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
      console.warn('[Mediasoup] Camera/Mic access warning, attempting audio-only fallback:', err);
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        localStreamRef.current = audioOnlyStream;
        setLocalStream(audioOnlyStream);
        setIsVideoOff(true);
        return audioOnlyStream;
      } catch (audioErr) {
        console.error('[Mediasoup] Could not acquire audio or video stream:', audioErr);
        const emptyStream = new MediaStream();
        localStreamRef.current = emptyStream;
        setLocalStream(emptyStream);
        setIsVideoOff(true);
        setIsAudioMuted(true);
        return emptyStream;
      }
    }
  }, [personalSettings]);

  // Voice Activity Detection (VAD) & Live Mic Volume Meter (BUG-006 & BUG-007)
  const startVAD = useCallback((stream) => {
    if (!stream || stream.getAudioTracks().length === 0) return;

    try {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      // Resume AudioContext if suspended (Chrome autoplay policy - BUG-007)
      const ensureAudioResumed = () => {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
      };
      ensureAudioResumed();
      window.addEventListener('click', ensureAudioResumed, { once: true });
      window.addEventListener('keydown', ensureAudioResumed, { once: true });
      window.addEventListener('touchstart', ensureAudioResumed, { once: true });

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);

      let lastSpeakingState = false;
      let lastEmitTime = 0;

      vadIntervalRef.current = setInterval(() => {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(1, average / 100);

        setMicVolume(isAudioMuted ? 0 : normalized);

        if (!socketRef.current || isAudioMuted) return;

        const isSpeaking = normalized > 0.15;
        const now = Date.now();

        // Throttle VAD socket emissions: emit immediately on transition, and at most once per 300ms during continuous speech (BUG-006)
        if (isSpeaking !== lastSpeakingState || (isSpeaking && now - lastEmitTime > 300)) {
          lastSpeakingState = isSpeaking;
          lastEmitTime = now;
          socketRef.current.emit('speaking-level', { level: isSpeaking ? normalized : 0 });
        }
      }, 100);
    } catch (e) {
      console.warn('[VAD] Audio analyzer unavailable:', e);
    }
  }, [isAudioMuted]);

  // ---------------------------------------------------------------------------
  // MEDIASOUP SFU PIPELINE: Device, Transports, Produce (Simulcast), Consume
  // ---------------------------------------------------------------------------

  // 1. Consume a remote producer track into a stable MediaStream
  const consumeProducer = useCallback(async ({ producerId, producerPeerId, kind, appData }) => {
    const device = deviceRef.current;
    const recvTransport = recvTransportRef.current;
    const socket = socketRef.current;

    if (!device || !recvTransport || !socket || recvTransport.closed) {
      // Queue producer for consumption as soon as recvTransport initializes
      pendingProducersQueue.current.push({ producerId, producerPeerId, kind, appData });
      return;
    }

    // Guard against in-flight & duplicate consumption of the same producer (BUG-002)
    if (consumingProducersRef.current.has(producerId)) return;
    for (const item of consumersRef.current.values()) {
      if (item.producerId === producerId) return;
    }
    consumingProducersRef.current.add(producerId);

    socket.emit('consume', {
      transportId: recvTransport.id,
      producerId,
      rtpCapabilities: device.rtpCapabilities
    }, async (response) => {
      if (response?.error) {
        consumingProducersRef.current.delete(producerId);
        console.warn(`[Mediasoup] Consume rejected for producer ${producerId}:`, response.error);
        return;
      }

      try {
        const { id, producerId: pId, kind: cKind, rtpParameters } = response;
        const consumer = await recvTransport.consume({
          id,
          producerId: pId,
          kind: cKind,
          rtpParameters
        });

        consumersRef.current.set(consumer.id, {
          consumer,
          peerId: producerPeerId,
          producerId: pId,
          kind: cKind,
          appData
        });

        const isScreen = appData?.mediaType === 'screen';

        if (isScreen) {
          // DEDICATED SCREEN SHARE STREAM (BUG-005)
          let screenStream = peerScreenStreamsRef.current.get(producerPeerId);
          if (!screenStream) {
            screenStream = new MediaStream();
            peerScreenStreamsRef.current.set(producerPeerId, screenStream);
          }
          screenStream.getTracks().forEach((t) => screenStream.removeTrack(t));
          screenStream.addTrack(consumer.track);

          socket.emit('resumeConsumer', { consumerId: consumer.id });

          setRemoteScreenStreams((prev) => ({
            ...prev,
            [producerPeerId]: screenStream
          }));
        } else {
          // CAMERA & MIC STABLE TRACK STORAGE
          let stream = peerMediaStreamsRef.current.get(producerPeerId);
          if (!stream) {
            stream = new MediaStream();
            peerMediaStreamsRef.current.set(producerPeerId, stream);
          }

          // Replace any prior track of the same kind to prevent track stacking
          stream.getTracks().forEach((existingTrack) => {
            if (existingTrack.kind === consumer.track.kind) {
              stream.removeTrack(existingTrack);
            }
          });
          stream.addTrack(consumer.track);

          // Resume consumer on the SFU
          socket.emit('resumeConsumer', { consumerId: consumer.id });

          // Update React remoteStreams state reference
          setRemoteStreams((prev) => ({
            ...prev,
            [producerPeerId]: stream
          }));
        }

        consumer.on('transportclose', () => {
          consumersRef.current.delete(consumer.id);
          consumingProducersRef.current.delete(pId);
        });

        consumer.on('trackended', () => {
          if (isScreen) {
            const sStream = peerScreenStreamsRef.current.get(producerPeerId);
            if (sStream) {
              sStream.removeTrack(consumer.track);
              setRemoteScreenStreams((prev) => ({ ...prev, [producerPeerId]: sStream }));
            }
          } else {
            const cStream = peerMediaStreamsRef.current.get(producerPeerId);
            if (cStream) {
              cStream.removeTrack(consumer.track);
              setRemoteStreams((prev) => ({ ...prev, [producerPeerId]: cStream }));
            }
          }
        });
      } catch (err) {
        consumingProducersRef.current.delete(producerId);
        console.error('[Mediasoup] Error finalizing consumer:', err);
      }
    });
  }, []);

  // 2. Publish local mic & camera tracks with Simulcast on SendTransport
  const publishLocalTracks = useCallback(async (stream, audioMuted, videoOff) => {
    const sendTransport = sendTransportRef.current;
    if (!sendTransport || sendTransport.closed) return;

    // A. Audio Track (Opus)
    const audioTrack = stream?.getAudioTracks()[0];
    if (audioTrack && !producersRef.current.has('audio')) {
      try {
        audioTrack.enabled = !audioMuted;
        const audioProducer = await sendTransport.produce({
          track: audioTrack,
          codecOptions: {
            opusStereo: true,
            opusDtx: true
          },
          appData: { mediaType: 'mic' }
        });
        producersRef.current.set('audio', audioProducer);

        if (audioMuted) {
          audioProducer.pause();
          socketRef.current?.emit('pauseProducer', { producerId: audioProducer.id });
        }
      } catch (err) {
        console.warn('[Mediasoup] Audio produce error:', err);
      }
    }

    // B. Video Track with SIMULCAST (VP8 / H264 multi-layer encodings)
    const videoTrack = stream?.getVideoTracks()[0];
    if (videoTrack && !producersRef.current.has('video')) {
      try {
        videoTrack.enabled = !videoOff;
        const videoProducer = await sendTransport.produce({
          track: videoTrack,
          encodings: [
            { maxBitrate: 100000, scaleResolutionDownBy: 4 }, // 180p Low Layer
            { maxBitrate: 300000, scaleResolutionDownBy: 2 }, // 360p Medium Layer
            { maxBitrate: 900000, scaleResolutionDownBy: 1 }  // 720p High Layer
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000
          },
          appData: { mediaType: 'camera' }
        });
        producersRef.current.set('video', videoProducer);

        if (videoOff) {
          videoProducer.pause();
          socketRef.current?.emit('pauseProducer', { producerId: videoProducer.id });
        }
      } catch (err) {
        console.warn('[Mediasoup] Video produce with simulcast error:', err);
      }
    }
  }, []);

  // 3. Initialize Mediasoup Device and establish Send/Recv WebRtcTransports
  const initMediasoupSession = useCallback(async (socket, activeStream, audioMuted, videoOff) => {
    return new Promise((resolve, reject) => {
      // Step A: Request Mediasoup Router RTP Capabilities from server
      socket.emit('getRouterRtpCapabilities', {}, async (data) => {
        if (data?.error || !data?.rtpCapabilities) {
          console.error('[Mediasoup] Failed to fetch router RTP capabilities:', data?.error);
          return reject(new Error(data?.error || 'No RTP capabilities'));
        }

        try {
          // Step B: Load Device
          const device = new Device();
          await device.load({ routerRtpCapabilities: data.rtpCapabilities });
          deviceRef.current = device;
          console.log('[Mediasoup] Client Device loaded successfully. Handler:', device.handlerName);

          // Step C: Create WebRtc SendTransport
          socket.emit('createWebRtcTransport', { direction: 'send', sctpCapabilities: device.sctpCapabilities }, async (sendParams) => {
            if (sendParams?.error) {
              return reject(new Error(sendParams.error));
            }

            const sendTransport = device.createSendTransport({
              ...sendParams,
              iceServers: sendParams.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
              socket.emit('connectWebRtcTransport', { transportId: sendTransport.id, dtlsParameters }, (res) => {
                if (res?.error) errback(new Error(res.error));
                else callback();
              });
            });

            sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
              socket.emit('produce', { transportId: sendTransport.id, kind, rtpParameters, appData }, (res) => {
                if (res?.error) errback(new Error(res.error));
                else callback({ id: res.id });
              });
            });

            sendTransport.on('connectionstatechange', async (state) => {
              console.log(`[Mediasoup] Send transport state: ${state}`);
              if (state === 'connected') {
                addToast('Uplink SFU transport established.', 'success', 2000);
              } else if (state === 'failed' || state === 'disconnected') {
                console.warn(`[Mediasoup] Send transport ${state}, triggering ICE restart...`);
                socket.emit('restartIce', { transportId: sendTransport.id }, async (res) => {
                  if (res?.iceParameters) {
                    try {
                      await sendTransport.restartIce({ iceParameters: res.iceParameters });
                      console.log('[Mediasoup] Send transport ICE restarted successfully');
                    } catch (e) {
                      console.error('[Mediasoup] Error applying restartIce to sendTransport:', e);
                    }
                  }
                });
              }
            });

            sendTransportRef.current = sendTransport;

            // Step D: Create WebRtc RecvTransport
            socket.emit('createWebRtcTransport', { direction: 'recv', sctpCapabilities: device.sctpCapabilities }, async (recvParams) => {
              if (recvParams?.error) {
                return reject(new Error(recvParams.error));
              }

              const recvTransport = device.createRecvTransport({
                ...recvParams,
                iceServers: recvParams.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }]
              });

              recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                socket.emit('connectWebRtcTransport', { transportId: recvTransport.id, dtlsParameters }, (res) => {
                  if (res?.error) errback(new Error(res.error));
                  else callback();
                });
              });

              recvTransport.on('connectionstatechange', async (state) => {
                console.log(`[Mediasoup] Recv transport state: ${state}`);
                if (state === 'connected') {
                  addToast('Downlink SFU transport established.', 'success', 2000);
                } else if (state === 'failed' || state === 'disconnected') {
                  console.warn(`[Mediasoup] Recv transport ${state}, triggering ICE restart...`);
                  socket.emit('restartIce', { transportId: recvTransport.id }, async (res) => {
                    if (res?.iceParameters) {
                      try {
                        await recvTransport.restartIce({ iceParameters: res.iceParameters });
                        console.log('[Mediasoup] Recv transport ICE restarted successfully');
                      } catch (e) {
                        console.error('[Mediasoup] Error applying restartIce to recvTransport:', e);
                      }
                    }
                  });
                }
              });

              recvTransportRef.current = recvTransport;

              // Step E: Publish Local Tracks with Simulcast
              await publishLocalTracks(activeStream, audioMuted, videoOff);

              // Step F: Flush any pending producers that arrived during handshake
              if (pendingProducersQueue.current.length > 0) {
                const queued = [...pendingProducersQueue.current];
                pendingProducersQueue.current = [];
                queued.forEach((item) => consumeProducer(item));
              }

              resolve();
            });
          });
        } catch (err) {
          console.error('[Mediasoup] Device initialization failure:', err);
          reject(err);
        }
      });
    });
  }, [addToast, publishLocalTracks, consumeProducer]);

  // ---------------------------------------------------------------------------
  // SFU Diagnostics Poller (Sample stats directly from Mediasoup WebRtcTransports)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isConnected) return;

    const statsInterval = setInterval(async () => {
      const transport = recvTransportRef.current || sendTransportRef.current;
      if (!transport || transport.closed) return;

      try {
        const stats = await transport.getStats();
        let rtt = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let jitter = 0;

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime !== undefined) {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            }
          }
          if (report.type === 'inbound-rtp') {
            packetsLost += report.packetsLost || 0;
            packetsReceived += report.packetsReceived || 0;
            if (report.jitter) jitter = Math.max(jitter, Math.round(report.jitter * 1000));
          }
        });

        const totalPackets = packetsLost + packetsReceived;
        const lossPct = totalPackets > 0 ? +((packetsLost / totalPackets) * 100).toFixed(1) : 0;

        let quality = 'excellent';
        if (rtt > 350 || lossPct > 4) quality = 'poor';
        else if (rtt > 200 || lossPct > 2) quality = 'fair';
        else if (rtt > 90 || lossPct > 0.5) quality = 'good';

        setNetworkStats({ quality, rttMs: rtt, packetLossPct: lossPct, jitterMs: jitter });
      } catch (err) {
        // Ignore stats errors on closing transport
      }
    }, 2500);

    return () => clearInterval(statsInterval);
  }, [isConnected]);

  // ---------------------------------------------------------------------------
  // Join Meeting Room Flow
  // ---------------------------------------------------------------------------
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
      console.log(`[Socket] Connected to SFU signaling engine: ${socket.id}`);
      setIsConnected(true);

      // Check for saved host session token to restore host privileges
      let savedHostSecret = null;
      try {
        const session = sessionStorage.getItem('vortex_session');
        if (session) {
          const parsed = JSON.parse(session);
          if (parsed.roomId === targetRoomId) {
            savedHostSecret = parsed.hostSecret;
          }
        }
      } catch {}

      socket.emit('join-room', {
        roomId: targetRoomId,
        userName: name,
        isAudioMuted: startMuted,
        isVideoOff: startVideoOff,
        hostSecret: savedHostSecret
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
      addToast(message || 'Host declined entry request.', 'error');
    });

    // Knocking notification for Host
    socket.on('participant-knock', ({ peerId, userName: knockingUser, requestedAt }) => {
      console.log(`[Admission] New participant knocking: ${knockingUser} (${peerId})`);
      setWaitingPeers((prev) => {
        const filtered = prev.filter((p) => p.peerId !== peerId);
        return [...filtered, { peerId, userName: knockingUser, requestedAt }];
      });
      addToast(`${knockingUser} requested to join the meeting.`, 'info');
    });

    socket.on('knock-handled', ({ peerId }) => {
      setWaitingPeers((prev) => prev.filter((p) => p.peerId !== peerId));
    });

    socket.on('knock-cancelled', ({ peerId }) => {
      setWaitingPeers((prev) => prev.filter((p) => p.peerId !== peerId));
    });

    socket.on('knock-all-handled', () => {
      setWaitingPeers([]);
    });

    // Room Snapshot with Admin & Authority state + Existing Producers
    socket.on('room-snapshot', async ({ participants, isHost: hostStatus, hostSecret: receivedHostSecret, hostId: currentHostId, settings, waitingList, existingProducers = [] }) => {
      setIsWaitingForAdmission(false);
      setAdmissionStatus(null);
      setIsHost(hostStatus);
      setHostId(currentHostId);

      if (hostStatus && receivedHostSecret) {
        hostSecretRef.current = receivedHostSecret;
        try {
          sessionStorage.setItem('vortex_session', JSON.stringify({
            roomId: targetRoomId,
            userName: name,
            hostSecret: receivedHostSecret
          }));
        } catch {}
      }

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

      addToast(
        hostStatus
          ? 'Connected as Meeting Host (Mediasoup SFU Active).'
          : 'Joined in Webinar Privacy Mode (Mediasoup SFU Active).',
        'info'
      );

      // Initialize Mediasoup SFU Device & Transports
      try {
        await initMediasoupSession(socket, currentStream, startMuted, startVideoOff);

        // Consume all existing active producers on SFU
        if (Array.isArray(existingProducers)) {
          existingProducers.forEach((item) => {
            consumeProducer(item);
          });
        }
      } catch (err) {
        console.error('[Mediasoup] SFU initialization failed on snapshot:', err);
        addToast('Media transport initialization failed. Please check network connection.', 'error');
      }
    });

    // Mediasoup New Producer Notification (Broadcast from SFU)
    socket.on('new-producer', (payload) => {
      console.log(`[Mediasoup] Received new-producer from peer ${payload.producerPeerId} [Kind: ${payload.kind}]`);
      consumeProducer(payload);
    });

    // Mediasoup Producer Closed
    socket.on('producer-closed', ({ producerId, peerId }) => {
      console.log(`[Mediasoup] Producer ${producerId} closed by peer ${peerId}`);
      consumingProducersRef.current.delete(producerId);
      let targetConsumerId = null;
      consumersRef.current.forEach((val, cId) => {
        if (val.producerId === producerId) {
          targetConsumerId = cId;
        }
      });

      if (targetConsumerId) {
        const item = consumersRef.current.get(targetConsumerId);
        if (item) {
          try { item.consumer.close(); } catch {}
          consumersRef.current.delete(targetConsumerId);

          if (item.appData?.mediaType === 'screen') {
            const screenStream = peerScreenStreamsRef.current.get(peerId);
            if (screenStream) {
              screenStream.getTracks().forEach((track) => track.stop());
              peerScreenStreamsRef.current.delete(peerId);
            }
            setRemoteScreenStreams((prev) => {
              const copy = { ...prev };
              delete copy[peerId];
              return copy;
            });
          } else {
            const stream = peerMediaStreamsRef.current.get(peerId);
            if (stream) {
              stream.getTracks().forEach((track) => {
                if (track.kind === item.kind) {
                  stream.removeTrack(track);
                }
              });
              setRemoteStreams((prev) => ({
                ...prev,
                [peerId]: stream
              }));
            }
          }
        }
      }
    });

    // SFU Worker Crash Automated Failover Handshake (BUG-001 / ARCH-002)
    socket.on('sfu-reconnect-needed', async ({ reason }) => {
      console.warn('[Mediasoup] Media router failover event received. Rebuilding SFU transports...', reason);
      addToast(reason || 'Media server re-routing stream transports...', 'warning', 3500);

      try {
        if (sendTransportRef.current && !sendTransportRef.current.closed) {
          try { sendTransportRef.current.close(); } catch {}
          sendTransportRef.current = null;
        }
        if (recvTransportRef.current && !recvTransportRef.current.closed) {
          try { recvTransportRef.current.close(); } catch {}
          recvTransportRef.current = null;
        }
        producersRef.current.clear();
        consumersRef.current.forEach(({ consumer }) => {
          try { consumer.close(); } catch {}
        });
        consumersRef.current.clear();
        consumingProducersRef.current.clear();

        peerMediaStreamsRef.current.forEach((st) => {
          st.getTracks().forEach((t) => t.stop());
        });
        peerMediaStreamsRef.current.clear();

        peerScreenStreamsRef.current.forEach((st) => {
          st.getTracks().forEach((t) => t.stop());
        });
        peerScreenStreamsRef.current.clear();

        setRemoteStreams({});
        setRemoteScreenStreams({});

        // Reinitialize device & transports with active stream
        await initMediasoupSession(socket, localStreamRef.current, isAudioMuted, isVideoOff);

        // Fetch current active producers on the newly allocated router
        socket.emit('get-existing-producers', (res) => {
          if (res?.producers && Array.isArray(res.producers)) {
            res.producers.forEach((item) => consumeProducer(item));
          }
        });

        addToast('Media connection re-established.', 'success', 2500);
      } catch (err) {
        console.error('[Mediasoup] Automatic SFU failover reconnection error:', err);
      }
    });

    // Session token update on host migration
    socket.on('host-token-update', ({ hostSecret: newSecret }) => {
      hostSecretRef.current = newSecret;
      try {
        sessionStorage.setItem('vortex_session', JSON.stringify({
          roomId: targetRoomId,
          userName: name,
          hostSecret: newSecret
        }));
      } catch {}
      addToast('Promoted to Host with secure admin token.', 'success');
    });

    // Room Settings Updated by Host
    socket.on('room-settings-updated', ({ settings, updatedBy }) => {
      setRoomSettings(settings);
      addToast(`Meeting policies updated by ${updatedBy}`, 'info');
    });

    // Host Force Actions
    socket.on('force-mute-audio', () => {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
      }
      setIsAudioMuted(true);
      const audioProducer = producersRef.current.get('audio');
      if (audioProducer && !audioProducer.closed) {
        audioProducer.pause();
        socketRef.current?.emit('pauseProducer', { producerId: audioProducer.id });
      }
      addToast('Your microphone was muted by the meeting host.', 'warning');
    });

    socket.on('force-disable-video', () => {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = false));
      }
      setIsVideoOff(true);
      const videoProducer = producersRef.current.get('video');
      if (videoProducer && !videoProducer.closed) {
        videoProducer.pause();
        socketRef.current?.emit('pauseProducer', { producerId: videoProducer.id });
      }
      addToast('Your video camera was disabled by the meeting host.', 'warning');
    });

    socket.on('kicked-from-room', ({ reason }) => {
      addToast(reason || 'You were removed from the meeting by the host.', 'error');
      leaveRoom();
    });

    socket.on('meeting-ended-by-host', ({ message }) => {
      addToast(message || 'The meeting was ended for everyone by the host.', 'info');
      leaveRoom();
    });

    socket.on('host-changed', ({ newHostId, newHostName }) => {
      setHostId(newHostId);
      const amIHost = socket.id === newHostId;
      setIsHost(amIHost);

      setRoster((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          if (id === newHostId) {
            next[id] = { ...next[id], isHost: true, role: 'host' };
          } else if (next[id].isHost) {
            // Restore previous host's role based on their media state rather than forcing 'audience' (BUG-004)
            const wasMuted = next[id].isAudioMuted;
            const wasVideoOff = next[id].isVideoOff;
            next[id] = {
              ...next[id],
              isHost: false,
              role: wasMuted && wasVideoOff ? 'audience' : 'speaker'
            };
          }
        });
        return next;
      });

      if (amIHost) {
        addToast('You are now the meeting host.', 'success');
      } else {
        addToast(`Host authority transferred to ${newHostName}.`, 'info');
      }
    });

    // When newly promoted to host, receive the current waiting list
    socket.on('waiting-list-update', ({ waitingList }) => {
      if (waitingList) {
        setWaitingPeers(waitingList);
      }
    });

    socket.on('admin-warning', ({ message }) => {
      addToast(message, 'warning');
    });

    socket.on('rate-limit-warning', ({ message }) => {
      addToast(message, 'warning');
    });

    socket.on('server-shutdown', ({ message }) => {
      addToast(message, 'warning');
    });

    socket.on('join-error', ({ message }) => {
      addToast(message, 'error');
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

            // Clean up leaving peer's camera/mic stream
            const stream = peerMediaStreamsRef.current.get(delta.peerId);
            if (stream) {
              stream.getTracks().forEach((t) => t.stop());
              peerMediaStreamsRef.current.delete(delta.peerId);
            }
            // Clean up leaving peer's screen share stream (BUG-005)
            const sStream = peerScreenStreamsRef.current.get(delta.peerId);
            if (sStream) {
              sStream.getTracks().forEach((t) => t.stop());
              peerScreenStreamsRef.current.delete(delta.peerId);
            }
            setRemoteStreams((prevStreams) => {
              const copy = { ...prevStreams };
              delete copy[delta.peerId];
              return copy;
            });
            setRemoteScreenStreams((prevScreens) => {
              const copy = { ...prevScreens };
              delete copy[delta.peerId];
              return copy;
            });
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

    // New in-call chat message
    socket.on('new-chat-message', (chat) => {
      setChatMessages((prev) => [...prev, chat]);
    });
  }, [
    personalSettings,
    getMediaStream,
    startVAD,
    addToast,
    initMediasoupSession,
    consumeProducer
  ]);

  // ---------------------------------------------------------------------------
  // Media Toggles (Microphone, Camera, Screen Sharing, Raise Hand)
  // ---------------------------------------------------------------------------

  const toggleAudio = useCallback(() => {
    if (!isHost && !roomSettings.allowMic && isAudioMuted) {
      addToast('Microphones are restricted by the meeting host.', 'warning');
      return;
    }

    const nextState = !isAudioMuted;
    setIsAudioMuted(nextState);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextState;
      });
    }

    const audioProducer = producersRef.current.get('audio');
    if (audioProducer && !audioProducer.closed) {
      if (nextState) {
        audioProducer.pause();
        socketRef.current?.emit('pauseProducer', { producerId: audioProducer.id });
      } else {
        audioProducer.resume();
        socketRef.current?.emit('resumeProducer', { producerId: audioProducer.id });
      }
    }

    if (socketRef.current) {
      socketRef.current.emit('toggle-media', {
        isAudioMuted: nextState,
        isVideoOff
      });
    }
  }, [isAudioMuted, isVideoOff, isHost, roomSettings.allowMic, addToast]);

  const toggleVideo = useCallback(() => {
    if (!isHost && !roomSettings.allowCamera && isVideoOff) {
      addToast('Cameras are restricted by the meeting host.', 'warning');
      return;
    }

    const nextState = !isVideoOff;
    setIsVideoOff(nextState);

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !nextState;
      });
    }

    const videoProducer = producersRef.current.get('video');
    if (videoProducer && !videoProducer.closed) {
      if (nextState) {
        videoProducer.pause();
        socketRef.current?.emit('pauseProducer', { producerId: videoProducer.id });
      } else {
        videoProducer.resume();
        socketRef.current?.emit('resumeProducer', { producerId: videoProducer.id });
      }
    }

    if (socketRef.current) {
      socketRef.current.emit('toggle-media', {
        isAudioMuted,
        isVideoOff: nextState
      });
    }
  }, [isVideoOff, isAudioMuted, isHost, roomSettings.allowCamera, addToast]);

  const toggleScreenShare = useCallback(async () => {
    if (!isHost && !roomSettings.allowScreenShare && !isScreenSharing) {
      addToast('Screen sharing is restricted by the meeting host.', 'warning');
      return;
    }

    const sendTransport = sendTransportRef.current;
    if (!sendTransport || sendTransport.closed) return;

    if (isScreenSharing) {
      // Stop Screen Share
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }

      const screenProducer = producersRef.current.get('screen');
      if (screenProducer) {
        screenProducer.close();
        socketRef.current?.emit('closeProducer', { producerId: screenProducer.id });
        producersRef.current.delete('screen');
      }

      setIsScreenSharing(false);
      socketRef.current?.emit('screen-share-status', { isSharing: false });
    } else {
      // Start Screen Share
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always'
          },
          audio: false
        });

        const screenTrack = stream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        const screenProducer = await sendTransport.produce({
          track: screenTrack,
          appData: { mediaType: 'screen' }
        });
        producersRef.current.set('screen', screenProducer);

        setIsScreenSharing(true);
        socketRef.current?.emit('screen-share-status', { isSharing: true });

        screenTrack.onended = () => {
          toggleScreenShare();
        };
      } catch (err) {
        console.warn('[Mediasoup] Screen sharing cancelled:', err);
      }
    }
  }, [isScreenSharing, isHost, roomSettings.allowScreenShare, addToast]);

  const toggleRaiseHand = useCallback(() => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    if (socketRef.current) {
      socketRef.current.emit('raise-hand', { isHandRaised: nextState });
    }
  }, [isHandRaised]);

  const sendChatMessage = useCallback((message) => {
    if (!message || !message.trim()) return;
    if (!isHost && !roomSettings.allowChat) {
      addToast('In-call chat is turned off by the host.', 'warning');
      return;
    }
    if (socketRef.current) {
      socketRef.current.emit('send-chat', { message: message.trim() });
    }
  }, [isHost, roomSettings.allowChat, addToast]);

  // ---------------------------------------------------------------------------
  // Admin Host Controls
  // ---------------------------------------------------------------------------
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

  const cancelWaiting = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('cancel-waiting');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsWaitingForAdmission(false);
    setAdmissionStatus(null);
  }, []);

  const updatePersonalSettings = useCallback(async (partial) => {
    const updated = { ...personalSettings, ...partial };
    setPersonalSettings(updated);
    try {
      localStorage.setItem('gmeet_personal_settings', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save personal settings to localStorage:', e);
    }

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

        const videoProducer = producersRef.current.get('video');
        if (videoProducer && newVideoTrack) {
          try {
            await videoProducer.replaceTrack({ track: newVideoTrack });
          } catch (e) {
            console.warn('[Mediasoup] replaceTrack video error:', e);
          }
        }

        const audioProducer = producersRef.current.get('audio');
        if (audioProducer && newAudioTrack) {
          try {
            await audioProducer.replaceTrack({ track: newAudioTrack });
          } catch (e) {
            console.warn('[Mediasoup] replaceTrack audio error:', e);
          }
        }
      }
    }
  }, [personalSettings, getMediaStream, isAudioMuted, isVideoOff]);

  // ---------------------------------------------------------------------------
  // Leave Room & Cleanup
  // ---------------------------------------------------------------------------
  const leaveRoom = useCallback(() => {
    // Close local producers
    producersRef.current.forEach((producer) => {
      try { producer.close(); } catch {}
    });
    producersRef.current.clear();

    // Close consumers
    consumersRef.current.forEach(({ consumer }) => {
      try { consumer.close(); } catch {}
    });
    consumersRef.current.clear();

    // Close SFU transports
    if (sendTransportRef.current && !sendTransportRef.current.closed) {
      try { sendTransportRef.current.close(); } catch {}
      sendTransportRef.current = null;
    }
    if (recvTransportRef.current && !recvTransportRef.current.closed) {
      try { recvTransportRef.current.close(); } catch {}
      recvTransportRef.current = null;
    }

    // Stop and clear remote media tracks
    peerMediaStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((t) => t.stop());
    });
    peerMediaStreamsRef.current.clear();

    peerScreenStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((t) => t.stop());
    });
    peerScreenStreamsRef.current.clear();
    consumingProducersRef.current.clear();

    // Stop local media
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

    try {
      sessionStorage.removeItem('vortex_session');
    } catch {}

    setLocalStream(null);
    setRoster({});
    setRemoteStreams({});
    setRemoteScreenStreams({});
    setIsConnected(false);
    setRoomId(null);
    setIsScreenSharing(false);
    setChatMessages([]);
    setIsWaitingForAdmission(false);
    setAdmissionStatus(null);
    setWaitingPeers([]);
  }, []);

  useEffect(() => {
    return () => leaveRoom();
  }, [leaveRoom]);

  // Scalability Telemetry
  const peerList = useMemo(() => Object.values(roster), [roster]);
  const totalPages = Math.max(1, Math.ceil(peerList.length / pageSize));

  const visiblePeerIds = useMemo(() => {
    const ids = new Set();
    if (!isHost) {
      if (hostId && roster[hostId]) {
        ids.add(hostId);
      }
      return ids;
    }
    const startIndex = (currentPage - 1) * pageSize;
    const pageSlice = peerList.slice(startIndex, startIndex + pageSize);
    pageSlice.forEach((p) => ids.add(p.peerId));
    if (activeSpeakerId && roster[activeSpeakerId]) {
      ids.add(activeSpeakerId);
    }
    if (pinnedPeerId && roster[pinnedPeerId]) {
      ids.add(pinnedPeerId);
    }
    return ids;
  }, [isHost, hostId, peerList, currentPage, pageSize, activeSpeakerId, pinnedPeerId, roster]);

  // Emit subscription engine updates for dynamic layer allocation (ISSUE-011 / ARCH-003)
  useEffect(() => {
    if (!socketRef.current || !isConnected) return;
    const timer = setTimeout(() => {
      socketRef.current?.emit('update-subscription-preferences', {
        pinnedPeerId,
        visiblePeerIds: Array.from(visiblePeerIds),
        networkQuality: networkStats.quality
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [visiblePeerIds, pinnedPeerId, networkStats.quality, isConnected]);

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
    remoteScreenStreams,
    pageSize,
    visiblePeerIds,
    activeSpeakerId,
    micVolume,
    pinnedPeerId,
    setPinnedPeerId,
    currentPage,
    totalPages,
    setCurrentPage,
    telemetry,
    networkStats,
    toasts,
    addToast,
    removeToast,
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
