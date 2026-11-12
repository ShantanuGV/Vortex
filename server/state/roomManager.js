import crypto from 'crypto';
import { MEETING_MODES } from '../security/permissionService.js';

/**
 * Distributed Room Lifecycle Manager
 * Coordinates distributed metadata with local Mediasoup Router instances.
 */
export class RoomManager {
  constructor(distributedState, routerAllocator) {
    this.state = distributedState;
    this.routerAllocator = routerAllocator;
    this.localRooms = new Map(); // roomId -> local room runtime object
  }

  /**
   * Get an existing room or create a new one using distributed locks to prevent race conditions
   * @param {string} roomId
   * @returns {Promise<Object>} Local room runtime object
   */
  async getOrCreateRoom(roomId) {
    let room = this.localRooms.get(roomId);
    if (room) return room;

    // Acquire distributed lock for room creation
    const lockToken = await this.state.acquireLock(`room-init:${roomId}`, 5000);

    try {
      // Re-check after lock
      room = this.localRooms.get(roomId);
      if (room) return room;

      // Allocate or fetch Mediasoup Router for room
      const { router, workerIndex, workerPid } = await this.routerAllocator.getOrCreateRoomRouter(roomId);

      // Create Mediasoup AudioLevelObserver for server-side C++ VAD (ARCH-007)
      let audioLevelObserver = null;
      try {
        audioLevelObserver = await router.createAudioLevelObserver({
          maxEntries: 1,
          threshold: -80,
          interval: 800
        });
      } catch (obsErr) {
        console.warn(`[RoomManager] AudioLevelObserver unavailable:`, obsErr.message);
      }

      // Fetch or initialize distributed metadata
      let meta = await this.state.get(`room:${roomId}:meta`);
      if (!meta) {
        meta = {
          id: roomId,
          hostSecret: crypto.randomBytes(24).toString('hex'),
          createdAt: Date.now(),
          mode: MEETING_MODES.CONFERENCE,
          settings: {
            isLocked: false,
            hostAdmission: true, // Waiting room enabled by default
            allowScreenShare: true,
            allowChat: true,
            allowMic: true,
            allowCamera: true,
            mode: MEETING_MODES.CONFERENCE
          }
        };
        await this.state.set(`room:${roomId}:meta`, meta, 86400); // 24h TTL
      }

      room = {
        id: roomId,
        router,
        workerIndex,
        workerPid,
        hostId: null,
        hostSecret: meta.hostSecret,
        settings: meta.settings,
        participants: new Map(), // socketId -> participantData
        waitingParticipants: new Map(), // socketId -> waitingData
        activeSpeakers: new Set(),
        pendingDeltas: [],
        flushTimer: null,
        createdAt: meta.createdAt,
        audioLevelObserver, // Mediasoup C++ AudioLevelObserver
        // Mediasoup local structures:
        transports: new Map(), // transportId -> WebRtcTransport
        producers: new Map(),  // producerId -> { producer, peerId, kind, appData }
        consumers: new Map()   // consumerId -> { consumer, peerId, producerId }
      };

      this.localRooms.set(roomId, room);
      return room;
    } finally {
      if (lockToken) {
        await this.state.releaseLock(`room-init:${roomId}`, lockToken);
      }
    }
  }

  /**
   * Get room if currently active locally
   */
  getRoom(roomId) {
    return this.localRooms.get(roomId) || null;
  }

  /**
   * Schedule batched broadcast of room deltas (50ms interval)
   */
  scheduleBatchedBroadcast(room, io) {
    if (room.flushTimer) return;

    room.flushTimer = setTimeout(() => {
      room.flushTimer = null;
      if (room.pendingDeltas.length === 0) return;

      const deltas = room.pendingDeltas;
      room.pendingDeltas = [];
      io.to(room.id).emit('room-deltas', deltas);
    }, 50);
  }

  /**
   * Queue a delta for batched broadcast
   */
  queueDelta(room, delta, io) {
    room.pendingDeltas.push(delta);
    this.scheduleBatchedBroadcast(room, io);
  }

  /**
   * Destroy and clean up room
   */
  async destroyRoom(roomId) {
    const room = this.localRooms.get(roomId);
    if (!room) return;

    if (room.flushTimer) {
      clearTimeout(room.flushTimer);
      room.flushTimer = null;
    }

    if (room.audioLevelObserver && !room.audioLevelObserver.closed) {
      try { room.audioLevelObserver.close(); } catch {}
    }

    // Release router
    this.routerAllocator.releaseRoomRouter(roomId);

    // Delete distributed metadata
    await this.state.del(`room:${roomId}:meta`);
    await this.state.del(`room:${roomId}:peers`);

    this.localRooms.delete(roomId);
    console.log(`[RoomManager] Room "${roomId}" completely destroyed.`);
  }
}

