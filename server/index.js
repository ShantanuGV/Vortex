import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import cluster from 'cluster';
import { fileURLToPath } from 'url';
import { setupWorker } from '@socket.io/sticky';
import { createAdapter } from '@socket.io/cluster-adapter';

// Modular Subsystems
import { config } from './config/index.js';
import { WorkerPool } from './media/workerPool.js';
import { MediaNode } from './media/mediaNode.js';
import { RouterAllocator } from './media/routerAllocator.js';
import { DistributedState } from './state/distributedState.js';
import { SessionManager } from './state/sessionManager.js';
import { RoomManager } from './state/roomManager.js';
import { MetricsCollector } from './monitoring/metrics.js';
import { Supervisor } from './monitoring/supervisor.js';
import { registerSocketHandlers } from './signaling/socketHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Enterprise Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Permits inline WebRTC blob media & streams
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST']
  })
);
app.use(express.json({ limit: '256kb' }));

// Static frontend delivery
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

const server = http.createServer(app);

// Socket.IO Server with Cluster Support
const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
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

if (!cluster.isPrimary) {
  io.adapter(createAdapter());
  setupWorker(io);
}

// -----------------------------------------------------------------------------
// Subsystem Instantiation
// -----------------------------------------------------------------------------

export const workerPool = new WorkerPool();
export const mediaNode = new MediaNode({ workerPool });
export const routerAllocator = new RouterAllocator(workerPool);
export const distributedState = new DistributedState();
export const sessionManager = new SessionManager(distributedState);
export const roomManager = new RoomManager(distributedState, routerAllocator);
export const metrics = new MetricsCollector();
export const supervisor = new Supervisor({ workerPool, roomManager, metrics, io });

// -----------------------------------------------------------------------------
// Anti-Abuse Token-Bucket Rate Limiter
// -----------------------------------------------------------------------------

const socketRateLimits = new Map();

function checkRateLimit(socketId) {
  const now = Date.now();
  let record = socketRateLimits.get(socketId);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + 1000 };
    socketRateLimits.set(socketId, record);
    return true;
  }
  record.count++;
  return record.count <= config.rateLimitPerSec;
}

io.use((socket, next) => {
  socketRateLimits.set(socket.id, { count: 0, resetAt: Date.now() + 1000 });
  socket.onAny(() => {
    if (!checkRateLimit(socket.id)) {
      metrics.increment('rateLimitViolationsTotal', 1);
      socket.emit('rate-limit-warning', {
        message: 'High request rate detected. Signaling throttled.'
      });
      return;
    }
  });
  next();
});

// Register Signaling Controllers
io.on('connection', (socket) => {
  registerSocketHandlers({
    io,
    socket,
    roomManager,
    sessionManager,
    metrics
  });
});

// -----------------------------------------------------------------------------
// Observability & Health Probes
// -----------------------------------------------------------------------------

// Kubernetes Liveness Probe
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Kubernetes Readiness Probe (Validates WorkerPool health)
app.get('/readyz', (req, res) => {
  const workerStats = workerPool.getStats();
  const hasAliveWorker = workerStats.some((w) => w.isAlive);

  if (!hasAliveWorker) {
    return res.status(503).json({
      ready: false,
      error: 'No healthy Mediasoup C++ workers available'
    });
  }

  const heapMB = Math.round(process.memoryUsage().heapUsed / (1024 * 1024));
  res.status(200).json({
    ready: true,
    nodeId: mediaNode.nodeId,
    activeRooms: roomManager.localRooms.size,
    activeWorkers: workerStats.length,
    heapUsedMB: heapMB
  });
});

// Health Summary
app.get('/api/health', (req, res) => {
  let totalParticipants = 0;
  roomManager.localRooms.forEach((r) => (totalParticipants += r.participants.size));

  res.json({
    status: 'healthy',
    nodeId: mediaNode.nodeId,
    activeRooms: roomManager.localRooms.size,
    totalParticipants,
    timestamp: new Date().toISOString()
  });
});

// Detailed Metrics & Prometheus Format
app.get('/api/metrics', (req, res) => {
  const data = metrics.getSystemMetrics({ roomManager, workerPool, mediaNode });

  if (req.headers.accept?.includes('text/plain')) {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    return res.send(metrics.toPrometheusFormat(data));
  }

  res.json(data);
});

// Room Info API
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = roomManager.getRoom(roomId);
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

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// -----------------------------------------------------------------------------
// Server Lifecycle & Bootstrap
// -----------------------------------------------------------------------------

const PORT = config.port;

export async function startServer() {
  // Initialize Mediasoup Worker Pool
  await workerPool.init();

  if (cluster.isPrimary) {
    server.listen(PORT, () => {
      console.log(`=============================================================`);
      console.log(`🚀 VORTEX Distributed Media Fabric Server running on port ${PORT}`);
      console.log(`   Media Node:      ${mediaNode.nodeId}`);
      console.log(`   Worker Pool:     ${workerPool.workers.length} Mediasoup C++ Workers active`);
      console.log(`   State Engine:    ${distributedState.isRedisActive ? 'Redis Distributed' : 'Memory Atomic Coordinator'}`);
      console.log(`   Web App:         http://localhost:${PORT}`);
      console.log(`   Metrics & Probes: /healthz, /readyz, /api/metrics`);
      console.log(`=============================================================`);
    });
  } else {
    server.listen(0, () => {
      console.log(`[Worker ${process.pid}] VORTEX Signaling & Mediasoup Node online (${mediaNode.nodeId})`);
    });
  }

  return { server, io, workerPool, roomManager };
}

// Auto-start when executed directly
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('[Server] Fatal bootstrap error:', err);
    process.exit(1);
  });
}

// Graceful Termination
function handleGracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Draining connections...`);

  io.emit('server-shutdown', {
    message: 'Server is undergoing scheduled restart. Please stand by.'
  });

  workerPool.close();

  server.close(() => {
    console.log('[Server] Connections drained. Process terminated cleanly.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Graceful shutdown timed out. Forcing termination.');
    process.exit(1);
  }, 8000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
