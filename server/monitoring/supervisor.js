/**
 * Worker & Node Failure Supervisor
 * Manages crash detection, automatic room router failover, and client reconnection triggers.
 */
export class Supervisor {
  constructor({ workerPool, roomManager, metrics, io }) {
    this.workerPool = workerPool;
    this.roomManager = roomManager;
    this.metrics = metrics;
    this.io = io;

    // Attach listener to WorkerPool died event
    if (this.workerPool) {
      this.workerPool.onWorkerDied((deathInfo) => this.handleWorkerCrash(deathInfo));
    }
  }

  /**
   * Handle unexpected death of a Mediasoup worker
   */
  async handleWorkerCrash({ workerIndex, deadPid, affectedRouters }) {
    console.error(`[Supervisor] Worker index ${workerIndex} (PID: ${deadPid}) crashed! Initiating automated recovery...`);
    this.metrics.increment('workerFailuresTotal', 1);

    const affectedRoomIds = [];
    if (this.roomManager && this.roomManager.localRooms) {
      this.roomManager.localRooms.forEach((room, roomId) => {
        if (room.workerIndex === workerIndex || room.workerPid === deadPid) {
          affectedRoomIds.push(roomId);
        }
      });
    }

    console.warn(`[Supervisor] Found ${affectedRoomIds.length} affected rooms: ${affectedRoomIds.join(', ')}`);

    for (const roomId of affectedRoomIds) {
      const room = this.roomManager.getRoom(roomId);
      if (!room) continue;

      try {
        console.log(`[Supervisor] Migrating room "${roomId}" to a surviving worker...`);

        // Clean up invalid objects from dead worker
        room.transports.clear();
        room.producers.clear();
        room.consumers.clear();

        // Release dead router and reallocate on healthy worker
        this.roomManager.routerAllocator.releaseRoomRouter(roomId);
        const { router, workerIndex: newWorkerIndex, workerPid: newPid } = 
          await this.roomManager.routerAllocator.getOrCreateRoomRouter(roomId);

        room.router = router;
        room.workerIndex = newWorkerIndex;
        room.workerPid = newPid;

        console.log(`[Supervisor] Room "${roomId}" recovered on Worker [${newWorkerIndex}] (New PID: ${newPid})`);

        // Notify connected participants to re-negotiate their WebRTC transports
        if (this.io) {
          this.io.to(roomId).emit('sfu-reconnect-needed', {
            roomId,
            reason: 'Media worker failover executed. Please re-establish media transports.'
          });
        }
      } catch (err) {
        console.error(`[Supervisor] Failed to recover room "${roomId}":`, err);
      }
    }
  }
}

