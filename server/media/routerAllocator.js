import { config } from '../config/index.js';

/**
 * Room Router Allocation & Worker Placement Service
 * Enforces room affinity and least-loaded worker selection.
 */
export class RouterAllocator {
  constructor(workerPool) {
    this.workerPool = workerPool;
    this.roomRouters = new Map(); // roomId -> { router, workerIndex, workerPid, createdAt }
  }

  /**
   * Get an existing router for a room, or allocate a new one on the least-loaded worker
   * @param {string} roomId
   * @returns {Promise<Object>} { router, workerIndex, workerPid, isNew }
   */
  async getOrCreateRoomRouter(roomId) {
    if (!roomId) throw new Error('[RouterAllocator] Room ID is required');

    let allocation = this.roomRouters.get(roomId);
    if (allocation && !allocation.router.closed) {
      return {
        router: allocation.router,
        workerIndex: allocation.workerIndex,
        workerPid: allocation.workerPid,
        isNew: false
      };
    }

    // Allocate new router on least-loaded worker
    const { router, workerIndex, workerPid } = await this.workerPool.createRouter({
      mediaCodecs: config.mediasoup.mediaCodecs,
      roomId
    });

    allocation = {
      router,
      workerIndex,
      workerPid,
      createdAt: Date.now()
    };

    this.roomRouters.set(roomId, allocation);

    router.on('@close', () => {
      this.roomRouters.delete(roomId);
    });

    console.log(`[RouterAllocator] Allocated Router ${router.id} for room "${roomId}" on Worker [${workerIndex}] (PID: ${workerPid})`);

    return {
      router,
      workerIndex,
      workerPid,
      isNew: true
    };
  }

  /**
   * Get router for a room if exists
   */
  getRouter(roomId) {
    const allocation = this.roomRouters.get(roomId);
    return allocation?.router || null;
  }

  /**
   * Remove and close router for a room
   */
  releaseRoomRouter(roomId) {
    const allocation = this.roomRouters.get(roomId);
    if (allocation) {
      if (!allocation.router.closed) {
        allocation.router.close();
      }
      this.roomRouters.delete(roomId);
      console.log(`[RouterAllocator] Released router for room "${roomId}"`);
    }
  }

  /**
   * Get active room router count
   */
  getActiveRouterCount() {
    return this.roomRouters.size;
  }
}

