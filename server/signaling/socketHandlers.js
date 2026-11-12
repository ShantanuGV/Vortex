import { AuthGuard } from '../security/authGuard.js';
import { PermissionService, MEETING_MODES } from '../security/permissionService.js';
import { sanitizeRoomId, sanitizeString, sanitizeChatMessage } from '../security/sanitizer.js';
import { SubscriptionEngine } from '../subscription/subscriptionEngine.js';
import { SimulcastManager } from '../media/simulcastManager.js';
import { ActiveSpeakerTracker } from '../subscription/activeSpeakerTracker.js';
import { config } from '../config/index.js';
import crypto from 'crypto';

export function registerSocketHandlers({
  io,
  socket,
  roomManager,
  sessionManager,
  metrics,
  subscriptionEngine = new SubscriptionEngine(),
  speakerTrackers = new Map() // roomId -> ActiveSpeakerTracker
}) {
  // Helper: Get or create active speaker tracker for room
  function getSpeakerTracker(roomId) {
    let tracker = speakerTrackers.get(roomId);
    if (!tracker) {
      tracker = new ActiveSpeakerTracker();
      speakerTrackers.set(roomId, tracker);
    }
    return tracker;
  }

  // Helper: Admit participant into room
  async function admitParticipant(room, targetSocket, { isAudioMuted = false, isVideoOff = false }) {
    const isHost = targetSocket.id === room.hostId;
    targetSocket.join(room.id);
    targetSocket.roomId = room.id;

    // Apply room policy defaults if restricted
    let actualAudioMuted = isAudioMuted;
    let actualVideoOff = isVideoOff;
    if (!isHost && !room.settings.allowMic) actualAudioMuted = true;
    if (!isHost && !room.settings.allowCamera) actualVideoOff = true;

    const participantData = {
      peerId: targetSocket.id,
      userName: targetSocket.userName,
      isAudioMuted: actualAudioMuted,
      isVideoOff: actualVideoOff,
      isScreenSharing: false,
      isHandRaised: false,
      isHost,
      role: isHost ? 'host' : actualVideoOff && actualAudioMuted ? 'audience' : 'speaker',
      speakingLevel: 0,
      joinedAt: Date.now()
    };

    room.participants.set(targetSocket.id, participantData);
    room.waitingParticipants.delete(targetSocket.id);

    // Create session in distributed session manager
    const session = await sessionManager.createSession({
      peerId: targetSocket.id,
      roomId: room.id,
      userName: targetSocket.userName,
      role: participantData.role,
      isHost,
      signalingNodeId: process.pid
    });

    console.log(`[Signaling] ${targetSocket.userName} (${targetSocket.id}) admitted into "${room.id}" [Host: ${isHost}]. Total: ${room.participants.size}`);

    const allParticipants = Array.from(room.participants.values());
    const waitingList = isHost ? Array.from(room.waitingParticipants.values()) : [];
    const isWebinar = room.settings.mode === MEETING_MODES.WEBINAR;

    // Visible participants determination (Privacy in webinar mode vs full conference)
    const visibleParticipants = isWebinar && !isHost
      ? allParticipants.filter((p) => p.peerId === room.hostId || p.peerId === targetSocket.id)
      : allParticipants;

    const visibleTotal = isWebinar && !isHost ? visibleParticipants.length : room.participants.size;

    // Collect existing active producers this peer is authorized to consume
    const authorizedProducers = [];
    if (room.producers) {
      room.producers.forEach((prodEntry, prodId) => {
        if (prodEntry.peerId === targetSocket.id) return; // Don't consume own stream
        if (PermissionService.canConsume(room, targetSocket.id, prodEntry)) {
          authorizedProducers.push({
            producerId: prodId,
            producerPeerId: prodEntry.peerId,
            kind: prodEntry.kind,
            appData: prodEntry.appData
          });
        }
      });
    }

    targetSocket.emit('room-snapshot', {
      roomId: room.id,
      isHost,
      hostSecret: isHost ? room.hostSecret : null,
      hostId: room.hostId,
      settings: room.settings,
      totalParticipants: visibleTotal,
      participants: visibleParticipants,
      waitingList,
      existingProducers: authorizedProducers,
      reconnectToken: session.reconnectToken,
      activeSpeakers: Array.from(room.activeSpeakers).filter(
        (spkId) => !isWebinar || isHost || spkId === room.hostId || spkId === targetSocket.id
      )
    });

    // Notify peers
    if (isWebinar && !isHost) {
      if (room.hostId) {
        io.to(room.hostId).emit('room-deltas', [{
          type: 'user-joined',
          participant: participantData
        }]);
      }
    } else {
      roomManager.queueDelta(room, {
        type: 'user-joined',
        participant: participantData
      }, io);
    }
  }

  // 1. Join Room Flow
  socket.on('join-room', async ({ roomId, userName, isAudioMuted = false, isVideoOff = false, hostSecret = null, reconnectToken = null }) => {
    const cleanRoomId = sanitizeRoomId(roomId);
    if (!cleanRoomId) {
      return socket.emit('join-error', { message: 'Invalid meeting code.' });
    }

    const cleanUserName = sanitizeString(userName, 40) || `User-${socket.id.slice(0, 4)}`;
    const room = await roomManager.getOrCreateRoom(cleanRoomId);

    // Host Session Re-authentication via hostSecret
    const isHostRestoration = Boolean(hostSecret && hostSecret === room.hostSecret);
    if (isHostRestoration) {
      room.hostId = socket.id;
      metrics.increment('reconnectionsTotal', 1);
      console.log(`[Auth] Host session restored via cryptographic token for ${cleanUserName} (${socket.id})`);
    }

    // Session Reconnection via reconnectToken
    if (reconnectToken) {
      const restored = await sessionManager.restoreSession(reconnectToken, socket.id);
      if (restored) {
        metrics.increment('reconnectionsTotal', 1);
        console.log(`[Auth] Participant session restored via reconnectToken for ${cleanUserName} (${socket.id})`);
      }
    }

    // Authority Check: If locked by host, reject new non-hosts
    if (room.settings.isLocked && room.hostId && socket.id !== room.hostId && !isHostRestoration) {
      return socket.emit('join-error', { message: 'This meeting is locked by the host.' });
    }

    socket.roomId = cleanRoomId;
    socket.userName = cleanUserName;

    // Elect host if room has no active host
    if (room.participants.size === 0 || !room.hostId) {
      room.hostId = socket.id;
    }
    const isHost = socket.id === room.hostId;

    // Host Admission Knocking Check
    if (!isHost && room.settings.hostAdmission && !isHostRestoration) {
      room.waitingParticipants.set(socket.id, {
        peerId: socket.id,
        userName: cleanUserName,
        isAudioMuted,
        isVideoOff,
        requestedAt: Date.now()
      });

      console.log(`[Admission] ${cleanUserName} (${socket.id}) knocking in "${cleanRoomId}"`);
      socket.emit('waiting-for-admission', { message: 'Waiting for the meeting host to let you in...' });

      if (room.hostId) {
        io.to(room.hostId).emit('participant-knock', {
          peerId: socket.id,
          userName: cleanUserName,
          requestedAt: Date.now()
        });
      }
      return;
    }

    // Direct admission
    await admitParticipant(room, socket, { isAudioMuted, isVideoOff });
  });

  // 1b. Host Admits a Waiting Participant
  socket.on('admit-peer', async ({ targetPeerId }) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateAdminAction(room, socket.id);
    if (!auth.ok) return socket.emit('admin-error', { message: auth.error });

    const waiting = room.waitingParticipants.get(targetPeerId);
    if (!waiting) return;

    const targetSocket = io.sockets.sockets.get(targetPeerId);
    if (!targetSocket) {
      room.waitingParticipants.delete(targetPeerId);
      return socket.emit('knock-handled', { peerId: targetPeerId, status: 'unavailable' });
    }

    await admitParticipant(room, targetSocket, {
      isAudioMuted: waiting.isAudioMuted,
      isVideoOff: waiting.isVideoOff
    });

    socket.emit('knock-handled', { peerId: targetPeerId, status: 'admitted' });
  });

  // 1c. Host Denies a Waiting Participant
  socket.on('deny-peer', ({ targetPeerId }) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateAdminAction(room, socket.id);
    if (!auth.ok) return socket.emit('admin-error', { message: auth.error });

    const waiting = room.waitingParticipants.get(targetPeerId);
    if (waiting) {
      room.waitingParticipants.delete(targetPeerId);
      const targetSocket = io.sockets.sockets.get(targetPeerId);
      if (targetSocket) {
        targetSocket.emit('join-denied', { message: 'The meeting host declined your request to join.' });
      }
    }

    socket.emit('knock-handled', { peerId: targetPeerId, status: 'denied' });
  });

  // 1d. Host Admits All Waiting Participants
  socket.on('admit-all-peers', async () => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateAdminAction(room, socket.id);
    if (!auth.ok) return socket.emit('admin-error', { message: auth.error });

    const waitingList = Array.from(room.waitingParticipants.values());
    for (const waiting of waitingList) {
      const targetSocket = io.sockets.sockets.get(waiting.peerId);
      if (targetSocket) {
        await admitParticipant(room, targetSocket, {
          isAudioMuted: waiting.isAudioMuted,
          isVideoOff: waiting.isVideoOff
        });
      }
    }
    room.waitingParticipants.clear();
    socket.emit('knock-all-handled');
  });

  // 1e. Participant cancels waiting
  socket.on('cancel-waiting', () => {
    const room = roomManager.getRoom(socket.roomId);
    if (room && room.waitingParticipants.has(socket.id)) {
      room.waitingParticipants.delete(socket.id);
      if (room.hostId) {
        io.to(room.hostId).emit('knock-cancelled', { peerId: socket.id });
      }
    }
  });

  // 2. Admin: Update Meeting Settings (including Conference / Webinar mode toggle)
  socket.on('update-room-settings', ({ settings }) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateAdminAction(room, socket.id);
    if (!auth.ok) return socket.emit('admin-error', { message: auth.error });

    room.settings = { ...room.settings, ...settings };
    io.to(room.id).emit('room-settings-updated', {
      settings: room.settings,
      updatedBy: socket.userName
    });

    if (settings.allowMic === false) socket.to(room.id).emit('force-mute-audio');
    if (settings.allowCamera === false) socket.to(room.id).emit('force-disable-video');
  });

  // 3. Admin: Mute All
  socket.on('host-mute-all', () => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateAdminAction(room, socket.id);
    if (!auth.ok) return socket.emit('admin-error', { message: auth.error });

    socket.to(room.id).emit('force-mute-audio');
    room.participants.forEach((p, id) => {
      if (id !== room.hostId) p.isAudioMuted = true;
    });

    roomManager.queueDelta(room, {
      type: 'host-action',
      action: 'mute-all',
      message: 'All participants were muted by the host.'
    }, io);
  });

  // 3b. Admin: Mute Peer
  socket.on('host-mute-peer', ({ targetPeerId }) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateAdminAction(room, socket.id);
    if (!auth.ok) return socket.emit('admin-error', { message: auth.error });

    const targetSocket = io.sockets.sockets.get(targetPeerId);
    if (targetSocket) targetSocket.emit('force-mute-audio');

    const participant = room.participants.get(targetPeerId);
    if (participant) {
      participant.isAudioMuted = true;
      roomManager.queueDelta(room, {
        type: 'peer-media-toggle',
        peerId: targetPeerId,
        isAudioMuted: true,
        isVideoOff: participant.isVideoOff,
        role: participant.role
      }, io);
    }
  });

  // 4. Admin: Kick Peer
  socket.on('host-kick-peer', async ({ targetPeerId }) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateAdminAction(room, socket.id);
    if (!auth.ok) return socket.emit('admin-error', { message: auth.error });

    const targetSocket = io.sockets.sockets.get(targetPeerId);
    if (targetSocket) {
      targetSocket.emit('kicked-from-room', { reason: 'You were removed from the meeting by the host.' });
      targetSocket.leave(room.id);
      targetSocket.roomId = null;
    }

    room.participants.delete(targetPeerId);
    room.activeSpeakers.delete(targetPeerId);
    await sessionManager.destroySession(targetPeerId);

    roomManager.queueDelta(room, {
      type: 'user-left',
      peerId: targetPeerId,
      reason: 'removed-by-host'
    }, io);
  });

  // 4b. Admin: End Meeting For All
  socket.on('host-end-meeting', async () => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateAdminAction(room, socket.id);
    if (!auth.ok) return socket.emit('admin-error', { message: auth.error });

    io.to(room.id).emit('meeting-ended-by-host', { message: 'The meeting was ended for everyone by the host.' });
    await roomManager.destroyRoom(room.id);
  });

  // 5. Paginated Peers
  socket.on('get-page-peers', ({ page = 1, pageSize = 6 }) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room) return;

    const all = Array.from(room.participants.values());
    const startIndex = (page - 1) * pageSize;
    const paginated = all.slice(startIndex, startIndex + pageSize);

    socket.emit('page-peers-response', {
      page,
      pageSize,
      total: all.length,
      peers: paginated
    });
  });

  // --- Mediasoup SFU Endpoints with Strict Ownership & Permission Validation ---

  // 6a. Get Router RTP Capabilities
  socket.on('getRouterRtpCapabilities', (data, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room || !room.router) {
      return typeof callback === 'function' && callback({ error: 'Room or Mediasoup router not found' });
    }
    if (typeof callback === 'function') {
      callback({ rtpCapabilities: room.router.rtpCapabilities });
    }
  });

  // 6a2. Get Active Existing Producers for Room (reconnection & failover - BUG-001/ARCH-002)
  socket.on('get-existing-producers', (callback) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room) return typeof callback === 'function' && callback({ error: 'Room not found' });

    const authorizedProducers = [];
    if (room.producers) {
      room.producers.forEach((prodEntry, prodId) => {
        if (prodEntry.peerId === socket.id) return;
        if (PermissionService.canConsume(room, socket.id, prodEntry)) {
          authorizedProducers.push({
            producerId: prodId,
            producerPeerId: prodEntry.peerId,
            kind: prodEntry.kind,
            appData: prodEntry.appData
          });
        }
      });
    }
    if (typeof callback === 'function') callback({ producers: authorizedProducers });
  });

  // 6b. Create WebRTC Transport
  socket.on('createWebRtcTransport', async ({ direction, sctpCapabilities }, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateRoomMembership(room, socket.id);
    if (!auth.ok) return typeof callback === 'function' && callback({ error: auth.error });

    try {
      const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || null;
      const listenIp = process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0';

      const listenIps = [
        {
          ip: listenIp,
          announcedIp: announcedIp || (process.env.NODE_ENV === 'production' ? announcedIp : '127.0.0.1')
        }
      ];

      const transport = await room.router.createWebRtcTransport({
        listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1000000
      });

      transport.appData = { peerId: socket.id, direction };
      room.transports.set(transport.id, transport);

      socket.transports = socket.transports || new Set();
      socket.transports.add(transport.id);
      metrics.increment('transportCreationTotal', 1);

      transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed' || dtlsState === 'failed') {
          transport.close();
        }
      });

      transport.on('close', () => {
        room.transports.delete(transport.id);
        if (socket.transports) socket.transports.delete(transport.id);
      });

      // Construct ICE servers list (ARCH-005)
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ];
      if (config.turn?.url) {
        iceServers.push({
          urls: config.turn.url,
          username: config.turn.username,
          credential: config.turn.credential
        });
      }

      if (typeof callback === 'function') {
        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
          sctpParameters: transport.sctpParameters,
          iceServers
        });
      }
    } catch (err) {
      console.error('[Mediasoup] createWebRtcTransport error:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // 6b2. Restart ICE on WebRTC Transport (BUG-010)
  socket.on('restartIce', async ({ transportId }, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateTransportOwnership(room, transportId, socket.id);
    if (!auth.ok) return typeof callback === 'function' && callback({ error: auth.error });

    try {
      const iceParameters = await auth.transport.restartIce();
      if (typeof callback === 'function') callback({ iceParameters });
    } catch (err) {
      console.error('[Mediasoup] restartIce error:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // 6c. Connect WebRTC Transport with Ownership Verification
  socket.on('connectWebRtcTransport', async ({ transportId, dtlsParameters }, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateTransportOwnership(room, transportId, socket.id);
    if (!auth.ok) return typeof callback === 'function' && callback({ error: auth.error });

    try {
      await auth.transport.connect({ dtlsParameters });
      if (typeof callback === 'function') callback({ connected: true });
    } catch (err) {
      console.error('[Mediasoup] connectWebRtcTransport error:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // 6d. Produce with Strict Ownership & Publish Permission Validation
  socket.on('produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    const transportAuth = AuthGuard.validateTransportOwnership(room, transportId, socket.id);
    if (!transportAuth.ok) return typeof callback === 'function' && callback({ error: transportAuth.error });

    const publishAuth = AuthGuard.validatePublishPermission(room, socket.id, kind, appData);
    if (!publishAuth.ok) return typeof callback === 'function' && callback({ error: publishAuth.error });

    try {
      const producer = await transportAuth.transport.produce({
        kind,
        rtpParameters,
        appData: { ...appData, peerId: socket.id }
      });

      room.producers.set(producer.id, {
        producer,
        peerId: socket.id,
        kind,
        appData
      });

      // Mediasoup Server-side AudioLevelObserver tracking (ARCH-007)
      if (kind === 'audio' && room.audioLevelObserver && !room.audioLevelObserver.closed) {
        room.audioLevelObserver.addProducer({ producerId: producer.id }).catch(() => {});
        if (!room.audioLevelObserver._vadBound) {
          room.audioLevelObserver._vadBound = true;
          room.audioLevelObserver.on('volumes', (volumes) => {
            if (!volumes || volumes.length === 0) return;
            const top = volumes[0];
            const prodEntry = room.producers.get(top.producer.id);
            if (prodEntry) {
              room.activeSpeakers.add(prodEntry.peerId);
              roomManager.queueDelta(room, {
                type: 'active-speaker-change',
                peerId: prodEntry.peerId,
                isSpeaking: true
              }, io);
            }
          });
          room.audioLevelObserver.on('silence', () => {
            if (room.activeSpeakers.size > 0) {
              room.activeSpeakers.clear();
              roomManager.queueDelta(room, {
                type: 'active-speaker-change',
                peerId: null,
                isSpeaking: false
              }, io);
            }
          });
        }
      }

      socket.producers = socket.producers || new Set();
      socket.producers.add(producer.id);
      metrics.increment('producersCreatedTotal', 1);

      producer.on('transportclose', () => {
        if (kind === 'audio' && room.audioLevelObserver && !room.audioLevelObserver.closed) {
          room.audioLevelObserver.removeProducer({ producerId: producer.id }).catch(() => {});
        }
        producer.close();
        room.producers.delete(producer.id);
      });

      producer.on('close', () => {
        if (kind === 'audio' && room.audioLevelObserver && !room.audioLevelObserver.closed) {
          room.audioLevelObserver.removeProducer({ producerId: producer.id }).catch(() => {});
        }
        room.producers.delete(producer.id);
        if (socket.producers) socket.producers.delete(producer.id);
        io.to(room.id).emit('producer-closed', { producerId: producer.id, peerId: socket.id });
      });

      // Broadcast new producer to authorized peers (Conference vs Webinar Mode)
      const isWebinar = room.settings.mode === MEETING_MODES.WEBINAR;
      const isHost = socket.id === room.hostId;
      const newProducerPayload = {
        producerId: producer.id,
        producerPeerId: socket.id,
        kind,
        appData
      };

      if (!isWebinar || isHost) {
        // Group Conference mode: all room members receive the new producer
        socket.to(room.id).emit('new-producer', newProducerPayload);
      } else if (room.hostId) {
        // Webinar mode: non-host streams routed strictly to host
        io.to(room.hostId).emit('new-producer', newProducerPayload);
      }

      if (typeof callback === 'function') callback({ id: producer.id });
    } catch (err) {
      console.error('[Mediasoup] produce error:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // 6e. Consume with Ownership & Authorization Validation
  socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    const transportAuth = AuthGuard.validateTransportOwnership(room, transportId, socket.id);
    if (!transportAuth.ok) return typeof callback === 'function' && callback({ error: transportAuth.error });

    const consumeAuth = AuthGuard.validateConsumeAuthorization(room, socket.id, producerId);
    if (!consumeAuth.ok) return typeof callback === 'function' && callback({ error: consumeAuth.error });

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      return typeof callback === 'function' && callback({ error: 'Cannot consume producer with provided RTP capabilities' });
    }

    try {
      const consumer = await transportAuth.transport.consume({
        producerId,
        rtpCapabilities,
        paused: true
      });

      room.consumers.set(consumer.id, {
        consumer,
        peerId: socket.id,
        producerId
      });

      socket.consumers = socket.consumers || new Set();
      socket.consumers.add(consumer.id);
      metrics.increment('consumersCreatedTotal', 1);

      consumer.on('transportclose', () => {
        consumer.close();
        room.consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        consumer.close();
        room.consumers.delete(consumer.id);
        socket.emit('consumer-closed', { consumerId: consumer.id, producerId });
      });

      consumer.on('producerpause', () => socket.emit('consumer-paused', { consumerId: consumer.id }));
      consumer.on('producerresume', () => socket.emit('consumer-resumed', { consumerId: consumer.id }));

      if (typeof callback === 'function') {
        callback({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          type: consumer.type,
          producerPaused: consumer.producerPaused
        });
      }
    } catch (err) {
      console.error('[Mediasoup] consume error:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // 6f. Resume Consumer
  socket.on('resumeConsumer', async ({ consumerId }, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room) return typeof callback === 'function' && callback?.({ error: 'Room not found' });
    const entry = room.consumers.get(consumerId);
    if (!entry || entry.peerId !== socket.id) {
      return typeof callback === 'function' && callback?.({ error: 'Consumer not found or ownership mismatch' });
    }

    try {
      await entry.consumer.resume();
      if (typeof callback === 'function') callback?.({ resumed: true });
    } catch (err) {
      if (typeof callback === 'function') callback?.({ error: err.message });
    }
  });

  // 6g. Pause Producer with Ownership Validation
  socket.on('pauseProducer', async ({ producerId }, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateProducerOwnership(room, producerId, socket.id);
    if (!auth.ok) return typeof callback === 'function' && callback?.({ error: auth.error });

    await auth.producerEntry.producer.pause();
    if (typeof callback === 'function') callback?.({ paused: true });
  });

  // 6h. Resume Producer with Ownership Validation
  socket.on('resumeProducer', async ({ producerId }, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateProducerOwnership(room, producerId, socket.id);
    if (!auth.ok) return typeof callback === 'function' && callback?.({ error: auth.error });

    await auth.producerEntry.producer.resume();
    if (typeof callback === 'function') callback?.({ resumed: true });
  });

  // 6i. Close Producer with Ownership Validation
  socket.on('closeProducer', ({ producerId }, callback) => {
    const room = roomManager.getRoom(socket.roomId);
    const auth = AuthGuard.validateProducerOwnership(room, producerId, socket.id);
    if (!auth.ok) return typeof callback === 'function' && callback?.({ error: auth.error });

    auth.producerEntry.producer.close();
    room.producers.delete(producerId);
    io.to(room.id).emit('producer-closed', { producerId, peerId: socket.id });
    if (typeof callback === 'function') callback?.({ closed: true });
  });

  // 7. Dynamic Subscription & Simulcast Layer Optimization Request
  socket.on('update-subscription-preferences', async ({ pinnedPeerId = null, visiblePeerIds = [], networkQuality }) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room) return;

    const tracker = getSpeakerTracker(room.id);
    const activeSpeakerId = tracker.getCurrentSpeaker();
    const recentSpeakerIds = tracker.getRecentSpeakers();

    const desiredSubscriptions = subscriptionEngine.evaluateSubscriptions({
      receiverId: socket.id,
      room,
      pinnedPeerId,
      activeSpeakerId,
      recentSpeakerIds,
      visiblePeerIds: new Set(visiblePeerIds),
      networkQuality
    });

    // Apply layers & pause unselected streams
    await SimulcastManager.applySubscriptionPlan(room, socket.id, desiredSubscriptions);
  });

  // 8. Speaking Level & VAD Processing
  socket.on('speaking-level', ({ level }) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    if (!participant || participant.isAudioMuted) return;

    const tracker = getSpeakerTracker(room.id);
    const speakerChanged = tracker.processSpeakingLevel(socket.id, level);

    if (speakerChanged) {
      const isSpeaking = level > 0.15;
      if (isSpeaking) room.activeSpeakers.add(socket.id);
      else room.activeSpeakers.delete(socket.id);

      roomManager.queueDelta(room, {
        type: 'active-speaker-change',
        peerId: socket.id,
        isSpeaking,
        userName: socket.userName
      }, io);
    }
  });

  // 9. Media State Toggles
  socket.on('toggle-media', ({ isAudioMuted, isVideoOff }) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room) return;

    const isHost = socket.id === room.hostId;
    let finalMuted = isAudioMuted;
    let finalVideoOff = isVideoOff;

    if (!isHost && !room.settings.allowMic && !isAudioMuted) {
      socket.emit('admin-warning', { message: 'Microphones are locked by the host.' });
      finalMuted = true;
    }
    if (!isHost && !room.settings.allowCamera && !isVideoOff) {
      socket.emit('admin-warning', { message: 'Cameras are locked by the host.' });
      finalVideoOff = true;
    }

    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.isAudioMuted = finalMuted;
      participant.isVideoOff = finalVideoOff;
      participant.role = isHost ? 'host' : finalVideoOff && finalMuted ? 'audience' : 'speaker';

      roomManager.queueDelta(room, {
        type: 'peer-media-toggle',
        peerId: socket.id,
        isAudioMuted: finalMuted,
        isVideoOff: finalVideoOff,
        role: participant.role
      }, io);
    }
  });

  // 10. Screen Share
  socket.on('screen-share-status', ({ isSharing }) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room) return;

    const isHost = socket.id === room.hostId;
    if (!isHost && !room.settings.allowScreenShare && isSharing) {
      return socket.emit('admin-warning', { message: 'Screen sharing is restricted by the host.' });
    }

    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.isScreenSharing = isSharing;
      roomManager.queueDelta(room, {
        type: 'peer-screen-share',
        peerId: socket.id,
        isSharing
      }, io);
    }
  });

  // 11. Raise Hand
  socket.on('raise-hand', ({ isHandRaised }) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.isHandRaised = isHandRaised;
      roomManager.queueDelta(room, {
        type: 'peer-raise-hand',
        peerId: socket.id,
        userName: socket.userName,
        isHandRaised
      }, io);
    }
  });

  // 12. Chat with Sanitization
  socket.on('send-chat', ({ message }) => {
    const room = roomManager.getRoom(socket.roomId);
    if (!room) return;

    const isHost = socket.id === room.hostId;
    if (!isHost && !room.settings.allowChat) {
      return socket.emit('admin-warning', { message: 'In-call chat is turned off by the host.' });
    }

    const cleanMessage = sanitizeChatMessage(message, 1000);
    if (!cleanMessage) return;

    const chatPayload = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      senderId: socket.id,
      senderName: socket.userName,
      isHost,
      message: cleanMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    io.to(room.id).emit('new-chat-message', chatPayload);
  });

  // 13. Disconnect Handling & Grace Period
  socket.on('disconnect', async () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // Remove from waiting queue if knocking
    if (room.waitingParticipants.has(socket.id)) {
      room.waitingParticipants.delete(socket.id);
      if (room.hostId) {
        io.to(room.hostId).emit('knock-cancelled', { peerId: socket.id });
      }
      return;
    }

    // Clean up socket's Mediasoup producers
    if (socket.producers && room.producers) {
      socket.producers.forEach((prodId) => {
        const pEntry = room.producers.get(prodId);
        if (pEntry) {
          pEntry.producer.close();
          room.producers.delete(prodId);
          io.to(roomId).emit('producer-closed', { producerId: prodId, peerId: socket.id });
        }
      });
      socket.producers.clear();
    }

    // Clean up socket's Mediasoup consumers
    if (socket.consumers && room.consumers) {
      socket.consumers.forEach((consId) => {
        const cEntry = room.consumers.get(consId);
        if (cEntry) {
          cEntry.consumer.close();
          room.consumers.delete(consId);
        }
      });
      socket.consumers.clear();
    }

    // Clean up socket's Mediasoup transports
    if (socket.transports && room.transports) {
      socket.transports.forEach((transId) => {
        const transport = room.transports.get(transId);
        if (transport) {
          transport.close();
          room.transports.delete(transId);
        }
      });
      socket.transports.clear();
    }

    room.participants.delete(socket.id);
    room.activeSpeakers.delete(socket.id);

    const tracker = speakerTrackers.get(roomId);
    if (tracker) tracker.removeParticipant(socket.id);

    // Enter session grace period
    await sessionManager.handleDisconnect(socket.id, (expiredSession) => {
      console.log(`[Signaling] Expired grace session for ${expiredSession.userName} (${expiredSession.peerId})`);
    });

    console.log(`[Signaling] Peer ${socket.userName} (${socket.id}) disconnected from "${roomId}". Remaining: ${room.participants.size}`);

    // Room Empty or Host Migration
    if (room.participants.size === 0) {
      if (room.waitingParticipants.size > 0) {
        // Promote first waiting user to host (BUG-009 Fix)
        const firstWaitingId = Array.from(room.waitingParticipants.keys())[0];
        const firstWaiting = room.waitingParticipants.get(firstWaitingId);
        const targetSocket = io.sockets.sockets.get(firstWaitingId);

        if (targetSocket) {
          room.hostId = firstWaitingId;
          console.log(`[Admin] Room "${roomId}" promoting waiting ${firstWaiting.userName} (${firstWaitingId}) to Host!`);
          await admitParticipant(room, targetSocket, {
            isAudioMuted: firstWaiting.isAudioMuted,
            isVideoOff: firstWaiting.isVideoOff
          });

          // 1. Regenerate hostSecret for the promoted host
          room.hostSecret = crypto.randomBytes(24).toString('hex');
          targetSocket.emit('host-token-update', { hostSecret: room.hostSecret });

          // 2. Transfer remaining waiting list to the new host
          const remainingWaitingList = Array.from(room.waitingParticipants.values());
          targetSocket.emit('waiting-list-update', { waitingList: remainingWaitingList });

          // 3. Inform room that host changed
          io.to(roomId).emit('host-changed', {
            newHostId: firstWaitingId,
            newHostName: firstWaiting.userName
          });
          return;
        }
      }

      // Empty room cleanup
      await roomManager.destroyRoom(roomId);
      speakerTrackers.delete(roomId);
    } else if (socket.id === room.hostId) {
      // Elect new host
      const newHostId = Array.from(room.participants.keys())[0];
      room.hostId = newHostId;
      const newHost = room.participants.get(newHostId);
      if (newHost) {
        newHost.isHost = true;
        newHost.role = 'host';

        io.to(roomId).emit('host-changed', {
          newHostId,
          newHostName: newHost.userName
        });

        roomManager.queueDelta(room, {
          type: 'peer-media-toggle',
          peerId: newHostId,
          isAudioMuted: newHost.isAudioMuted,
          isVideoOff: newHost.isVideoOff,
          role: 'host',
          isHost: true
        }, io);

        const waitingList = Array.from(room.waitingParticipants.values());
        io.to(newHostId).emit('waiting-list-update', { waitingList });

        room.hostSecret = crypto.randomBytes(24).toString('hex');
        io.to(newHostId).emit('host-token-update', { hostSecret: room.hostSecret });
      }

      roomManager.queueDelta(room, {
        type: 'user-left',
        peerId: socket.id,
        userName: socket.userName
      }, io);
    } else {
      roomManager.queueDelta(room, {
        type: 'user-left',
        peerId: socket.id,
        userName: socket.userName
      }, io);
    }
  });
}

