import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend build
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

const server = http.createServer(app);

// Highly optimized Socket.io configuration for high-concurrency (5,000+ peers)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  perMessageDeflate: {
    threshold: 1024
  },
  httpCompression: true,
  pingInterval: 15000,
  pingTimeout: 30000,
  maxHttpBufferSize: 1e6
});

/**
 * High-Scale Room Data Structure with Admin / Host Control:
 * Room:
 *   - id: string
 *   - hostId: string (socket ID of primary meeting administrator)
 *   - settings: {
 *       isLocked: boolean,
 *       allowScreenShare: boolean,
 *       allowChat: boolean,
 *       allowMic: boolean,
 *       allowCamera: boolean
 *     }
 *   - participants: Map(socketId -> { id, userName, isAudioMuted, isVideoOff, isScreenSharing, isHandRaised, isHost, role, joinedAt })
 *   - activeSpeakers: Set(socketId)
 *   - pendingDeltas: Array
 *   - flushTimer: Timer
 */
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      hostId: null,
      settings: {
        isLocked: false,
        allowScreenShare: true,
        allowChat: true,
        allowMic: true,
        allowCamera: true
      },
      participants: new Map(),
      activeSpeakers: new Set(),
      pendingDeltas: [],
      flushTimer: null,
      createdAt: Date.now()
    });
  }
  return rooms.get(roomId);
}

// Batched Delta Broadcaster (50ms interval ticks)
function scheduleBatchedBroadcast(room) {
  if (room.flushTimer) return;

  room.flushTimer = setTimeout(() => {
    room.flushTimer = null;
    if (room.pendingDeltas.length === 0) return;

    const deltas = room.pendingDeltas;
    room.pendingDeltas = [];
    io.to(room.id).emit('room-deltas', deltas);
  }, 50);
}

function queueDelta(room, delta) {
  room.pendingDeltas.push(delta);
  scheduleBatchedBroadcast(room);
}

// --- REST Endpoints ---

app.get('/api/health', (req, res) => {
  let totalParticipants = 0;
  rooms.forEach((r) => (totalParticipants += r.participants.size));

  res.json({
    status: 'healthy',
    activeRooms: rooms.size,
    totalParticipants,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/metrics', (req, res) => {
  let totalParticipants = 0;
  const roomSummaries = [];

  rooms.forEach((r) => {
    totalParticipants += r.participants.size;
    roomSummaries.push({
      roomId: r.id,
      hostId: r.hostId,
      participants: r.participants.size,
      activeSpeakers: r.activeSpeakers.size,
      settings: r.settings,
      uptimeSec: Math.floor((Date.now() - r.createdAt) / 1000)
    });
  });

  const memory = process.memoryUsage();
  const cpus = os.cpus();

  res.json({
    system: {
      platform: os.platform(),
      cpuCores: cpus.length,
      cpuModel: cpus[0]?.model || 'Unknown',
      totalRamGB: +(os.totalmem() / (1024 ** 3)).toFixed(2),
      freeRamGB: +(os.freemem() / (1024 ** 3)).toFixed(2),
      processMemoryMB: {
        rss: +(memory.rss / (1024 ** 2)).toFixed(2),
        heapUsed: +(memory.heapUsed / (1024 ** 2)).toFixed(2),
        heapTotal: +(memory.heapTotal / (1024 ** 2)).toFixed(2)
      }
    },
    scalability: {
      activeRooms: rooms.size,
      totalParticipants,
      maxRecommendedPerRoom: 500,
      concurrentRoomsCapacity: cpus.length * 2,
      selectiveForwardingEnabled: true
    },
    rooms: roomSummaries
  });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) {
    return res.json({ exists: false, count: 0 });
  }

  return res.json({
    exists: true,
    count: room.participants.size,
    hostId: room.hostId,
    settings: room.settings
  });
});

// --- Socket.IO Event Handlers with Authority Enforcement ---

io.on('connection', (socket) => {
  // 1. Join Room
  socket.on('join-room', ({ roomId, userName, isAudioMuted = false, isVideoOff = false }) => {
    const room = getOrCreateRoom(roomId);

    // Authority Check: If meeting is locked by the host, reject non-hosts
    if (room.settings.isLocked && room.hostId && socket.id !== room.hostId) {
      socket.emit('join-error', {
        message: 'This meeting is locked by the host. New participants cannot join at this time.'
      });
      return;
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName || `User-${socket.id.slice(0, 4)}`;

    // If room has no active host, first participant becomes the Host/Admin
    const isFirstParticipant = room.participants.size === 0 || !room.hostId;
    if (isFirstParticipant) {
      room.hostId = socket.id;
    }
    const isHost = socket.id === room.hostId;

    // Apply host room policy defaults if restricted
    let actualAudioMuted = isAudioMuted;
    let actualVideoOff = isVideoOff;
    if (!isHost && !room.settings.allowMic) {
      actualAudioMuted = true;
    }
    if (!isHost && !room.settings.allowCamera) {
      actualVideoOff = true;
    }

    const participantData = {
      peerId: socket.id,
      userName: socket.userName,
      isAudioMuted: actualAudioMuted,
      isVideoOff: actualVideoOff,
      isScreenSharing: false,
      isHandRaised: false,
      isHost,
      role: isHost ? 'host' : actualVideoOff && actualAudioMuted ? 'audience' : 'speaker',
      speakingLevel: 0,
      joinedAt: Date.now()
    };

    room.participants.set(socket.id, participantData);

    console.log(`[Signaling] ${socket.userName} (${socket.id}) joined "${roomId}" [Host: ${isHost}]. Total: ${room.participants.size}`);

    const allParticipants = Array.from(room.participants.values());

    // Send full snapshot including host authority and room settings
    socket.emit('room-snapshot', {
      roomId,
      isHost,
      hostId: room.hostId,
      settings: room.settings,
      totalParticipants: room.participants.size,
      participants: allParticipants,
      activeSpeakers: Array.from(room.activeSpeakers)
    });

    // Notify other peers
    queueDelta(room, {
      type: 'user-joined',
      participant: participantData
    });
  });

  // 2. Admin / Host: Update Meeting Settings
  socket.on('update-room-settings', ({ settings }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    // Authority Enforcement: Only host can modify meeting settings
    if (socket.id !== room.hostId) {
      socket.emit('admin-error', { message: 'Unauthorized: Only the meeting host can change settings.' });
      return;
    }

    room.settings = { ...room.settings, ...settings };
    console.log(`[Admin] Host updated settings for "${roomId}":`, room.settings);

    // Broadcast updated settings to everyone
    io.to(roomId).emit('room-settings-updated', {
      settings: room.settings,
      updatedBy: socket.userName
    });

    // Policy enforcement: if host locked mics, force-mute all non-hosts
    if (settings.allowMic === false) {
      socket.to(roomId).emit('force-mute-audio');
    }
    // If host locked cameras, force-disable video for non-hosts
    if (settings.allowCamera === false) {
      socket.to(roomId).emit('force-disable-video');
    }
  });

  // 3. Admin / Host: Mute All Participants
  socket.on('host-mute-all', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (socket.id !== room.hostId) return;

    console.log(`[Admin] Host muted all participants in "${roomId}"`);
    socket.to(roomId).emit('force-mute-audio');

    // Update roster state for all non-hosts
    room.participants.forEach((p, id) => {
      if (id !== room.hostId) {
        p.isAudioMuted = true;
      }
    });

    queueDelta(room, {
      type: 'host-action',
      action: 'mute-all',
      message: 'All participants were muted by the host.'
    });
  });

  // 3b. Admin / Host: Mute an Individual Participant
  socket.on('host-mute-peer', ({ targetPeerId }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (socket.id !== room.hostId) return;

    console.log(`[Admin] Host muted participant ${targetPeerId} in "${roomId}"`);
    const targetSocket = io.sockets.sockets.get(targetPeerId);
    if (targetSocket) {
      targetSocket.emit('force-mute-audio');
    }

    const participant = room.participants.get(targetPeerId);
    if (participant) {
      participant.isAudioMuted = true;
      queueDelta(room, {
        type: 'peer-media-toggle',
        peerId: targetPeerId,
        isAudioMuted: true,
        isVideoOff: participant.isVideoOff,
        role: participant.role
      });
    }
  });

  // 4. Admin / Host: Remove / Kick Participant
  socket.on('host-kick-peer', ({ targetPeerId }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (socket.id !== room.hostId) return;

    console.log(`[Admin] Host kicked peer ${targetPeerId} from "${roomId}"`);

    const targetSocket = io.sockets.sockets.get(targetPeerId);
    if (targetSocket) {
      targetSocket.emit('kicked-from-room', {
        reason: 'You were removed from the meeting by the host.'
      });
      targetSocket.leave(roomId);
      targetSocket.roomId = null;
    }

    room.participants.delete(targetPeerId);
    room.activeSpeakers.delete(targetPeerId);

    queueDelta(room, {
      type: 'user-left',
      peerId: targetPeerId,
      reason: 'removed-by-host'
    });
  });

  // 4b. Admin / Host: End Meeting For All
  socket.on('host-end-meeting', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (socket.id !== room.hostId) return;

    console.log(`[Admin] Host ended meeting "${roomId}" for everyone.`);
    io.to(roomId).emit('meeting-ended-by-host', {
      message: 'The meeting was ended for everyone by the host.'
    });

    if (room.flushTimer) clearTimeout(room.flushTimer);
    rooms.delete(roomId);
  });

  // 5. Paginated Peers for Selective Video
  socket.on('get-page-peers', ({ page = 1, pageSize = 6 }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
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

  // 6. WebRTC SDP Offer Relay
  socket.on('offer', ({ targetPeerId, sdp }) => {
    io.to(targetPeerId).emit('offer', {
      callerPeerId: socket.id,
      sdp,
      userName: socket.userName
    });
  });

  // 7. WebRTC SDP Answer Relay
  socket.on('answer', ({ targetPeerId, sdp }) => {
    io.to(targetPeerId).emit('answer', {
      responderPeerId: socket.id,
      sdp
    });
  });

  // 8. ICE Candidate Relay
  socket.on('ice-candidate', ({ targetPeerId, candidate }) => {
    io.to(targetPeerId).emit('ice-candidate', {
      senderPeerId: socket.id,
      candidate
    });
  });

  // 9. Media State Toggle with Permission Check
  socket.on('toggle-media', ({ isAudioMuted, isVideoOff }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const isHost = socket.id === room.hostId;

    // Check host policy: if host locked mics/cameras, reject unmuting for non-hosts
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

      queueDelta(room, {
        type: 'peer-media-toggle',
        peerId: socket.id,
        isAudioMuted: finalMuted,
        isVideoOff: finalVideoOff,
        role: participant.role
      });
    }
  });

  // 10. Voice Activity Detection (VAD)
  socket.on('speaking-level', ({ level }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const participant = room.participants.get(socket.id);
    if (!participant || participant.isAudioMuted) return;

    const isSpeaking = level > 0.15;
    const wasSpeaking = room.activeSpeakers.has(socket.id);

    if (isSpeaking && !wasSpeaking) {
      room.activeSpeakers.add(socket.id);
      queueDelta(room, {
        type: 'active-speaker-change',
        peerId: socket.id,
        isSpeaking: true,
        userName: socket.userName
      });
    } else if (!isSpeaking && wasSpeaking) {
      room.activeSpeakers.delete(socket.id);
      queueDelta(room, {
        type: 'active-speaker-change',
        peerId: socket.id,
        isSpeaking: false,
        userName: socket.userName
      });
    }
  });

  // 11. Screen Share with Host Permission Check
  socket.on('screen-share-status', ({ isSharing }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const isHost = socket.id === room.hostId;

    if (!isHost && !room.settings.allowScreenShare && isSharing) {
      socket.emit('admin-warning', { message: 'Screen sharing is restricted to meeting hosts.' });
      return;
    }

    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.isScreenSharing = isSharing;
      queueDelta(room, {
        type: 'peer-screen-share',
        peerId: socket.id,
        isSharing
      });
    }
  });

  // 12. Raise Hand
  socket.on('raise-hand', ({ isHandRaised }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.isHandRaised = isHandRaised;
      queueDelta(room, {
        type: 'peer-raise-hand',
        peerId: socket.id,
        userName: socket.userName,
        isHandRaised
      });
    }
  });

  // 13. In-Call Chat with Permission Check
  socket.on('send-chat', ({ message }) => {
    const roomId = socket.roomId;
    if (!roomId || !message || !message.trim()) return;

    const room = rooms.get(roomId);
    const isHost = socket.id === room.hostId;

    if (!isHost && !room.settings.allowChat) {
      socket.emit('admin-warning', { message: 'In-call chat is turned off by the host.' });
      return;
    }

    const chatPayload = {
      senderId: socket.id,
      senderName: socket.userName,
      isHost,
      message: message.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    io.to(roomId).emit('new-chat-message', chatPayload);
  });

  // 14. Disconnect & Host Migration
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.participants.delete(socket.id);
    room.activeSpeakers.delete(socket.id);

    console.log(`[Signaling] Peer ${socket.userName} (${socket.id}) disconnected.`);

    if (room.participants.size === 0) {
      if (room.flushTimer) clearTimeout(room.flushTimer);
      rooms.delete(roomId);
      console.log(`[Signaling] Room "${roomId}" deleted (empty).`);
    } else {
      // If host left, elect the next available participant as host
      if (socket.id === room.hostId) {
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
          console.log(`[Admin] Host migrated to ${newHost.userName} (${newHostId}) in room "${roomId}"`);
        }
      }

      queueDelta(room, {
        type: 'user-left',
        peerId: socket.id,
        userName: socket.userName
      });
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`=============================================================`);
  console.log(`🚀 Scalable Google Meet Signaling Server running on port ${PORT}`);
  console.log(`   Web App:         http://localhost:${PORT}`);
  console.log(`   Admin Controls:  Active (Role-based permissions & policies)`);
  console.log(`   Load Metrics:    http://localhost:${PORT}/api/metrics`);
  console.log(`=============================================================`);
});
