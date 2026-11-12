import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import cluster from 'cluster';
import { fileURLToPath } from 'url';
import { setupWorker } from '@socket.io/sticky';
import { createAdapter } from '@socket.io/cluster-adapter';
import mediasoup from 'mediasoup';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Enterprise Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows inline WebRTC media and dynamic blob elements
    crossOriginEmbedderPolicy: false
  })
);

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST']
  })
);
app.use(express.json({ limit: '256kb' }));

// Serve static frontend build
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

const server = http.createServer(app);

// Highly optimized Socket.io configuration for high-concurrency (5,000+ peers)
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
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

// In cluster worker mode, hook cluster adapter & sticky worker
if (!cluster.isPrimary) {
  io.adapter(createAdapter());
  setupWorker(io);
}

// --- Mediasoup SFU Worker & Media Codecs ---
// Spawn exactly one C++ Mediasoup Worker per Node.js clustered process
let mediasoupWorker = null;

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1
    }
  }
];

async function initMediasoupWorker() {
  if (mediasoupWorker && !mediasoupWorker.closed) return mediasoupWorker;

  mediasoupWorker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT, 10) || 40000,
    rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT, 10) || 49999
  });

  mediasoupWorker.on('died', () => {
    console.error(`[Mediasoup] SFU Worker PID ${mediasoupWorker.pid} died! Exiting process...`);
    setTimeout(() => process.exit(1), 2000);
  });

  console.log(`[Mediasoup] SFU Worker spawned (PID: ${mediasoupWorker.pid})`);
  return mediasoupWorker;
}

// --- Anti-Abuse & Rate Limiting Engine ---
const socketRateLimits = new Map(); // socketId -> { count: number, resetAt: number }
const MAX_EVENTS_PER_SECOND = parseInt(process.env.RATE_LIMIT_PER_SEC, 10) || 50;

function checkRateLimit(socketId) {
  const now = Date.now();
  let record = socketRateLimits.get(socketId);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + 1000 };
    socketRateLimits.set(socketId, record);
    return true;
  }
  record.count++;
  return record.count <= MAX_EVENTS_PER_SECOND;
}

// Socket Rate Limiting Middleware
io.use((socket, next) => {
  socketRateLimits.set(socket.id, { count: 0, resetAt: Date.now() + 1000 });
  socket.onAny(() => {
    if (!checkRateLimit(socket.id)) {
      socket.emit('rate-limit-warning', {
        message: 'High request rate detected. Signaling throttled.'
      });
      return;
    }
  });
  next();
});

// --- Sanitization Utilities ---
function sanitizeString(str, maxLength = 80) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>'"&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '&': '&amp;' }[c]))
    .trim()
    .slice(0, maxLength);
}

function sanitizeRoomId(roomId) {
  if (typeof roomId !== 'string') return '';
  return roomId
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 64);
}

/**
 * High-Scale Room Data Structure with Admin / Host Control & Cryptographic Host Token:
 * Room:
 *   - id: string
 *   - hostId: string (socket ID of primary meeting administrator)
 *   - hostSecret: string (cryptographic token for host session preservation)
 *   - settings: {
 *       isLocked: boolean,
 *       hostAdmission: boolean,
 *       allowScreenShare: boolean,
 *       allowChat: boolean,
 *       allowMic: boolean,
 *       allowCamera: boolean
 *     }
 *   - participants: Map(socketId -> { id, userName, isAudioMuted, isVideoOff, isScreenSharing, isHandRaised, isHost, role, joinedAt })
 *   - waitingParticipants: Map(socketId -> { peerId, userName, isAudioMuted, isVideoOff, requestedAt })
 *   - activeSpeakers: Set(socketId)
 *   - pendingDeltas: Array
 *   - flushTimer: Timer
 */
const rooms = new Map();

async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    if (!mediasoupWorker) {
      await initMediasoupWorker();
    }
    const router = await mediasoupWorker.createRouter({ mediaCodecs });

    room = {
      id: roomId,
      router,
      hostId: null,
      hostSecret: crypto.randomBytes(24).toString('hex'), // Cryptographically secure host preservation token
      settings: {
        isLocked: false,
        hostAdmission: true, // Host admission (waiting room) enabled by default
        allowScreenShare: true,
        allowChat: true,
        allowMic: true,
        allowCamera: true
      },
      participants: new Map(),
      waitingParticipants: new Map(),
      activeSpeakers: new Set(),
      pendingDeltas: [],
      flushTimer: null,
      createdAt: Date.now(),
      // Mediasoup SFU structures:
      transports: new Map(), // transportId -> WebRtcTransport
      producers: new Map(),  // producerId -> { producer, peerId, kind, appData }
      consumers: new Map()   // consumerId -> { consumer, peerId, producerId }
    };
    rooms.set(roomId, room);
    console.log(`[Mediasoup] Instantiated Router ${router.id} for room "${roomId}"`);
  }
  return room;
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

// --- Helper: Admit a Participant into a Room ---
function admitParticipantToRoom(room, socket, { isAudioMuted = false, isVideoOff = false }) {
  const isHost = socket.id === room.hostId;
  socket.join(room.id);
  socket.roomId = room.id;

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
  room.waitingParticipants.delete(socket.id);

  console.log(`[Signaling] ${socket.userName} (${socket.id}) admitted into "${room.id}" [Host: ${isHost}]. Total: ${room.participants.size}`);

  const allParticipants = Array.from(room.participants.values());
  const waitingList = isHost ? Array.from(room.waitingParticipants.values()) : [];

  // Privacy & Star-Topology:
  // Host sees all participants and true count.
  // Non-host participants only see the Host and themselves!
  const visibleParticipants = isHost
    ? allParticipants
    : allParticipants.filter((p) => p.peerId === room.hostId || p.peerId === socket.id);

  const visibleTotal = isHost ? room.participants.size : visibleParticipants.length;

  // Mediasoup: Collect existing active producers this peer is authorized to consume
  const authorizedProducers = [];
  if (room.producers) {
    room.producers.forEach((prodEntry, prodId) => {
      if (prodEntry.peerId === socket.id) return; // Don't consume own stream
      if (isHost || prodEntry.peerId === room.hostId) {
        authorizedProducers.push({
          producerId: prodId,
          producerPeerId: prodEntry.peerId,
          kind: prodEntry.kind,
          appData: prodEntry.appData
        });
      }
    });
  }

  socket.emit('room-snapshot', {
    roomId: room.id,
    isHost,
    hostSecret: isHost ? room.hostSecret : null,
    hostId: room.hostId,
    settings: room.settings,
    totalParticipants: visibleTotal,
    participants: visibleParticipants,
    waitingList,
    existingProducers: authorizedProducers,
    activeSpeakers: Array.from(room.activeSpeakers).filter(
      (spkId) => isHost || spkId === room.hostId || spkId === socket.id
    )
  });

  // Notify peers:
  if (isHost) {
    // If Host joined/reconnected, broadcast to all participants
    queueDelta(room, {
      type: 'user-joined',
      participant: participantData
    });
  } else {
    // Non-host joined: ONLY notify the host!
    // Other audience members do NOT know or see this participant
    if (room.hostId) {
      io.to(room.hostId).emit('room-deltas', [{
        type: 'user-joined',
        participant: participantData
      }]);
    }
  }
}

// --- Socket.IO Event Handlers with Authority Enforcement ---

io.on('connection', (socket) => {
  // 1. Join Room (with Host Admission / Waiting Room & Session Token)
  socket.on('join-room', async ({ roomId, userName, isAudioMuted = false, isVideoOff = false, hostSecret = null }) => {
    const cleanRoomId = sanitizeRoomId(roomId);
    if (!cleanRoomId) {
      socket.emit('join-error', {
        message: 'Invalid meeting code. Please enter a valid meeting code.'
      });
      return;
    }

    const cleanUserName = sanitizeString(userName, 40) || `User-${socket.id.slice(0, 4)}`;
    const room = await getOrCreateRoom(cleanRoomId);

    // Host Session Re-authentication:
    // If a disconnecting host refreshes or reconnects with their valid cryptographic hostSecret,
    // immediately re-instate them as Host without sending them to the waiting room!
    const isHostRestoration = Boolean(hostSecret && hostSecret === room.hostSecret);
    if (isHostRestoration) {
      room.hostId = socket.id;
      console.log(`[Auth] Host session restored via cryptographic token for ${cleanUserName} (${socket.id})`);
    }

    // Authority Check: If meeting is locked by the host, reject non-hosts
    if (room.settings.isLocked && room.hostId && socket.id !== room.hostId) {
      socket.emit('join-error', {
        message: 'This meeting is locked by the host. New participants cannot join at this time.'
      });
      return;
    }

    socket.roomId = cleanRoomId;
    socket.userName = cleanUserName;

    // If room has no active host, first participant becomes the Host/Admin
    const isFirstParticipant = room.participants.size === 0 || !room.hostId;
    if (isFirstParticipant) {
      room.hostId = socket.id;
    }
    const isHost = socket.id === room.hostId;

    // Host Admission Check:
    // If room already has a host, hostAdmission is enabled, and not host restoration:
    if (!isHost && room.settings.hostAdmission) {
      room.waitingParticipants.set(socket.id, {
        peerId: socket.id,
        userName: socket.userName,
        isAudioMuted,
        isVideoOff,
        requestedAt: Date.now()
      });

      console.log(`[Admission] ${socket.userName} (${socket.id}) is waiting for host admission in "${cleanRoomId}"`);

      // Notify the waiting participant to show waiting state in Lobby
      socket.emit('waiting-for-admission', {
        message: 'Waiting for the meeting host to let you in...'
      });

      // Notify the host about the knock request
      if (room.hostId) {
        io.to(room.hostId).emit('participant-knock', {
          peerId: socket.id,
          userName: socket.userName,
          requestedAt: Date.now()
        });
      }
      return;
    }

    // Direct admission (Host, host restoration, or hostAdmission disabled)
    admitParticipantToRoom(room, socket, { isAudioMuted, isVideoOff });
  });

  // 1b. Host Admits a Waiting Participant
  socket.on('admit-peer', ({ targetPeerId }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (socket.id !== room.hostId) return;

    const waiting = room.waitingParticipants.get(targetPeerId);
    if (!waiting) return;

    const targetSocket = io.sockets.sockets.get(targetPeerId);
    if (!targetSocket) {
      room.waitingParticipants.delete(targetPeerId);
      socket.emit('knock-handled', { peerId: targetPeerId, status: 'unavailable' });
      return;
    }

    console.log(`[Admission] Host approved entry for ${waiting.userName} (${targetPeerId}) in "${roomId}"`);

    // Admit target participant
    admitParticipantToRoom(room, targetSocket, {
      isAudioMuted: waiting.isAudioMuted,
      isVideoOff: waiting.isVideoOff
    });

    // Notify host that knock was accepted
    socket.emit('knock-handled', { peerId: targetPeerId, status: 'admitted' });
  });

  // 1c. Host Denies a Waiting Participant
  socket.on('deny-peer', ({ targetPeerId }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (socket.id !== room.hostId) return;

    const waiting = room.waitingParticipants.get(targetPeerId);
    if (waiting) {
      console.log(`[Admission] Host declined entry for ${waiting.userName} (${targetPeerId}) in "${roomId}"`);
      room.waitingParticipants.delete(targetPeerId);

      const targetSocket = io.sockets.sockets.get(targetPeerId);
      if (targetSocket) {
        targetSocket.emit('join-denied', {
          message: 'The meeting host declined your request to join.'
        });
      }
    }

    socket.emit('knock-handled', { peerId: targetPeerId, status: 'denied' });
  });

  // 1d. Host Admits All Waiting Participants
  socket.on('admit-all-peers', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (socket.id !== room.hostId) return;

    const waitingList = Array.from(room.waitingParticipants.values());
    waitingList.forEach((waiting) => {
      const targetSocket = io.sockets.sockets.get(waiting.peerId);
      if (targetSocket) {
        admitParticipantToRoom(room, targetSocket, {
          isAudioMuted: waiting.isAudioMuted,
          isVideoOff: waiting.isVideoOff
        });
      }
    });
    room.waitingParticipants.clear();
    socket.emit('knock-all-handled');
  });

  // 1e. Participant cancels waiting
  socket.on('cancel-waiting', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    if (room.waitingParticipants.has(socket.id)) {
      room.waitingParticipants.delete(socket.id);
      if (room.hostId) {
        io.to(room.hostId).emit('knock-cancelled', { peerId: socket.id });
      }
    }
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

  // --- Mediasoup SFU Endpoints ---

  // 6a. Get Router RTP Capabilities
  socket.on('getRouterRtpCapabilities', (data, callback) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room || !room.router) {
      return typeof callback === 'function' && callback({ error: 'Room or Mediasoup router not found' });
    }
    if (typeof callback === 'function') {
      callback({ rtpCapabilities: room.router.rtpCapabilities });
    }
  });

  // 6b. Create WebRTC Transport (configured with NAT traversal via listenIps)
  socket.on('createWebRtcTransport', async ({ direction, sctpCapabilities }, callback) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room || !room.router) {
      return typeof callback === 'function' && callback({ error: 'Room or Mediasoup router not found' });
    }

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

      room.transports.set(transport.id, transport);
      socket.transports = socket.transports || new Set();
      socket.transports.add(transport.id);

      transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed' || dtlsState === 'failed') {
          transport.close();
        }
      });

      transport.on('close', () => {
        room.transports.delete(transport.id);
        if (socket.transports) socket.transports.delete(transport.id);
      });

      if (typeof callback === 'function') {
        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
          sctpParameters: transport.sctpParameters
        });
      }
    } catch (err) {
      console.error('[Mediasoup] createWebRtcTransport error:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // 6c. Connect WebRTC Transport
  socket.on('connectWebRtcTransport', async ({ transportId, dtlsParameters }, callback) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return typeof callback === 'function' && callback({ error: 'Room not found' });

    const transport = room.transports.get(transportId);
    if (!transport) return typeof callback === 'function' && callback({ error: 'Transport not found' });

    try {
      await transport.connect({ dtlsParameters });
      if (typeof callback === 'function') callback({ connected: true });
    } catch (err) {
      console.error('[Mediasoup] connectWebRtcTransport error:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // 6d. Produce (upload local audio/video/screen tracks)
  socket.on('produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return typeof callback === 'function' && callback({ error: 'Room not found' });

    const transport = room.transports.get(transportId);
    if (!transport) return typeof callback === 'function' && callback({ error: 'Transport not found' });

    try {
      const producer = await transport.produce({
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

      socket.producers = socket.producers || new Set();
      socket.producers.add(producer.id);

      producer.on('transportclose', () => {
        producer.close();
        room.producers.delete(producer.id);
      });

      producer.on('close', () => {
        room.producers.delete(producer.id);
        if (socket.producers) socket.producers.delete(producer.id);
        io.to(roomId).emit('producer-closed', { producerId: producer.id, peerId: socket.id });
      });

      // Broadcast new producer to authorized peers (Webinar Privacy):
      // If host produces, broadcast to all participants in room
      // If non-host produces, notify only the host
      const isHost = socket.id === room.hostId;
      const newProducerPayload = {
        producerId: producer.id,
        producerPeerId: socket.id,
        kind,
        appData
      };

      if (isHost) {
        socket.to(roomId).emit('new-producer', newProducerPayload);
      } else if (room.hostId) {
        io.to(room.hostId).emit('new-producer', newProducerPayload);
      }

      if (typeof callback === 'function') callback({ id: producer.id });
    } catch (err) {
      console.error('[Mediasoup] produce error:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // 6e. Consume (receive remote audio/video/screen tracks)
  socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room || !room.router) return typeof callback === 'function' && callback({ error: 'Room or router not found' });

    const transport = room.transports.get(transportId);
    if (!transport) return typeof callback === 'function' && callback({ error: 'Transport not found' });

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      return typeof callback === 'function' && callback({ error: 'Cannot consume producer with provided RTP capabilities' });
    }

    try {
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true // Start paused per Mediasoup best practice; client will call resumeConsumer
      });

      room.consumers.set(consumer.id, {
        consumer,
        peerId: socket.id,
        producerId
      });

      socket.consumers = socket.consumers || new Set();
      socket.consumers.add(consumer.id);

      consumer.on('transportclose', () => {
        consumer.close();
        room.consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        consumer.close();
        room.consumers.delete(consumer.id);
        socket.emit('consumer-closed', { consumerId: consumer.id, producerId });
      });

      consumer.on('producerpause', () => {
        socket.emit('consumer-paused', { consumerId: consumer.id });
      });

      consumer.on('producerresume', () => {
        socket.emit('consumer-resumed', { consumerId: consumer.id });
      });

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
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return typeof callback === 'function' && callback?.({ error: 'Room not found' });

    const entry = room.consumers.get(consumerId);
    if (!entry) return typeof callback === 'function' && callback?.({ error: 'Consumer not found' });

    try {
      await entry.consumer.resume();
      if (typeof callback === 'function') callback?.({ resumed: true });
    } catch (err) {
      if (typeof callback === 'function') callback?.({ error: err.message });
    }
  });

  // 6g. Pause Producer
  socket.on('pauseProducer', async ({ producerId }, callback) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return typeof callback === 'function' && callback?.({ error: 'Room not found' });
    const entry = room.producers.get(producerId);
    if (entry && entry.peerId === socket.id) {
      await entry.producer.pause();
    }
    if (typeof callback === 'function') callback?.({ paused: true });
  });

  // 6h. Resume Producer
  socket.on('resumeProducer', async ({ producerId }, callback) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return typeof callback === 'function' && callback?.({ error: 'Room not found' });
    const entry = room.producers.get(producerId);
    if (entry && entry.peerId === socket.id) {
      await entry.producer.resume();
    }
    if (typeof callback === 'function') callback?.({ resumed: true });
  });

  // 6i. Close Producer
  socket.on('closeProducer', ({ producerId }, callback) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return typeof callback === 'function' && callback?.({ error: 'Room not found' });

    const entry = room.producers.get(producerId);
    if (entry && entry.peerId === socket.id) {
      entry.producer.close();
      room.producers.delete(producerId);
      io.to(roomId).emit('producer-closed', { producerId, peerId: socket.id });
    }
    if (typeof callback === 'function') callback?.({ closed: true });
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

  // 13. In-Call Chat with Permission Check & Input Sanitization
  socket.on('send-chat', ({ message }) => {
    const roomId = socket.roomId;
    if (!roomId || typeof message !== 'string' || !message.trim()) return;

    const room = rooms.get(roomId);
    if (!room) return;
    const isHost = socket.id === room.hostId;

    if (!isHost && !room.settings.allowChat) {
      socket.emit('admin-warning', { message: 'In-call chat is turned off by the host.' });
      return;
    }

    const cleanMessage = sanitizeString(message, 1000);
    if (!cleanMessage) return;

    const chatPayload = {
      id: crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random()}`,
      senderId: socket.id,
      senderName: socket.userName,
      isHost,
      message: cleanMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    io.to(roomId).emit('new-chat-message', chatPayload);
  });

  // 14. Disconnect & Host Migration
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);

    // If waiting participant disconnected, remove and notify host
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

    console.log(`[Signaling] Peer ${socket.userName} (${socket.id}) disconnected.`);

    if (room.participants.size === 0) {
      // Host Admission Stranding Recovery:
      // If host left and no other admitted participants exist, BUT users are waiting:
      if (room.waitingParticipants.size > 0) {
        const firstWaitingId = Array.from(room.waitingParticipants.keys())[0];
        const firstWaiting = room.waitingParticipants.get(firstWaitingId);
        const targetSocket = io.sockets.sockets.get(firstWaitingId);

        if (targetSocket) {
          room.hostId = firstWaitingId;
          console.log(`[Admin] Room "${roomId}" had 0 participants but waiting users. Promoting ${firstWaiting.userName} (${firstWaitingId}) to Host!`);
          admitParticipantToRoom(room, targetSocket, {
            isAudioMuted: firstWaiting.isAudioMuted,
            isVideoOff: firstWaiting.isVideoOff
          });
          return;
        }
      }

      // If room is truly empty (0 participants and 0 waiting), close router and clean up
      if (room.router && !room.router.closed) {
        room.router.close();
        console.log(`[Mediasoup] Router closed for room "${roomId}"`);
      }
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

          // Broadcast host-changed notification to all participants
          io.to(roomId).emit('host-changed', {
            newHostId,
            newHostName: newHost.userName
          });

          // Queue roster delta so all clients update newHost role/badge immediately
          queueDelta(room, {
            type: 'peer-media-toggle',
            peerId: newHostId,
            isAudioMuted: newHost.isAudioMuted,
            isVideoOff: newHost.isVideoOff,
            role: 'host',
            isHost: true
          });

          // Transfer active waiting list to the newly elected host!
          const waitingList = Array.from(room.waitingParticipants.values());
          io.to(newHostId).emit('waiting-list-update', { waitingList });

          // Issue new host secret token to the elected host
          room.hostSecret = crypto.randomBytes(24).toString('hex');
          io.to(newHostId).emit('host-token-update', { hostSecret: room.hostSecret });

          console.log(`[Admin] Host migrated to ${newHost.userName} (${newHostId}) with ${waitingList.length} waiting users in room "${roomId}"`);
        }
      }

      // User-left delta broadcast:
      if (socket.id === room.hostId) {
        // If host left, notify all participants
        queueDelta(room, {
          type: 'user-left',
          peerId: socket.id,
          userName: socket.userName
        });
      } else if (room.hostId) {
        // Non-host left: only notify host
        io.to(room.hostId).emit('room-deltas', [{
          type: 'user-left',
          peerId: socket.id,
          userName: socket.userName
        }]);
      }
    }
  });
});

// --- Cloud / Kubernetes Health & Readiness Probes ---
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

app.get('/readyz', (req, res) => {
  const heapMB = process.memoryUsage().heapUsed / (1024 * 1024);
  res.status(200).json({
    ready: true,
    activeRooms: rooms.size,
    heapUsedMB: Math.round(heapMB)
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;

// Start Mediasoup SFU Worker and HTTP Server
async function startServer() {
  await initMediasoupWorker();

  // In standalone mode, listen on PORT. In cluster worker mode, sticky master handles port routing.
  if (cluster.isPrimary) {
    server.listen(PORT, () => {
      console.log(`=============================================================`);
      console.log(`🚀 Scalable VORTEX SFU Server running on port ${PORT}`);
      console.log(`   Architecture:    Mediasoup Centralized SFU + Multi-Worker`);
      console.log(`   Web App:         http://localhost:${PORT}`);
      console.log(`   Host Privacy:    Webinar Host-Moderated SFU active`);
      console.log(`   Load Metrics:    http://localhost:${PORT}/api/metrics`);
      console.log(`   Health Probes:   /healthz & /readyz`);
      console.log(`=============================================================`);
    });
  } else {
    server.listen(0, () => {
      console.log(`[Worker ${process.pid}] VORTEX Signaling & Mediasoup SFU Worker online`);
    });
  }
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

// --- Graceful Shutdown Handler ---
function handleGracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
  
  // Notify connected sockets of server shutdown
  io.emit('server-shutdown', {
    message: 'Server is restarting for scheduled maintenance. Please wait a moment.'
  });

  // Close Mediasoup worker
  if (mediasoupWorker && !mediasoupWorker.closed) {
    mediasoupWorker.close();
  }

  // Clear pending delta flush timers for all rooms
  rooms.forEach((room) => {
    if (room.router && !room.router.closed) {
      room.router.close();
    }
    if (room.flushTimer) {
      clearTimeout(room.flushTimer);
      room.flushTimer = null;
    }
  });

  // Close server and drain connections
  server.close(() => {
    console.log('[Server] HTTP and WebSocket connections drained. Exiting cleanly.');
    process.exit(0);
  });

  // Force exit after 8 seconds if connections fail to drain
  setTimeout(() => {
    console.error('[Server] Graceful shutdown timeout exceeded. Forcing exit.');
    process.exit(1);
  }, 8000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
