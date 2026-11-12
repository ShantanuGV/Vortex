import mediasoup from 'mediasoup';
import os from 'os';
import { config } from '../config/index.js';

/**
 * Mediasoup Multi-Worker Pool Manager
 * Manages multiple C++ worker subprocesses mapped to distinct CPU cores.
 */
export class WorkerPool {
  constructor(options = {}) {
    this.numWorkers = options.numWorkers || config.mediasoup.numWorkers || Math.max(1, Math.min(os.cpus().length, 4));
    this.rtcMinPort = options.rtcMinPort || config.mediasoup.rtcMinPort || 40000;
    this.rtcMaxPort = options.rtcMaxPort || config.mediasoup.rtcMaxPort || 49999;
    this.workers = []; // Array of { worker, pid, index, routers: Map, load: number }
    this.isInitialized = false;
    this.onWorkerDiedCallback = null;
  }

  /**
   * Set callback for when a worker crashes
   */
  onWorkerDied(cb) {
    this.onWorkerDiedCallback = cb;
  }

  /**
   * Initialize pool of Mediasoup C++ workers
   */
  async init() {
    if (this.isInitialized) return;

    // Calculate port ranges per worker to avoid port collision
    const totalPorts = this.rtcMaxPort - this.rtcMinPort + 1;
    const portsPerWorker = Math.floor(totalPorts / this.numWorkers);

    console.log(`[WorkerPool] Spawning ${this.numWorkers} Mediasoup C++ Workers (Port Range: ${this.rtcMinPort}-${this.rtcMaxPort})...`);

    for (let i = 0; i < this.numWorkers; i++) {
      const minPort = this.rtcMinPort + i * portsPerWorker;
      const maxPort = minPort + portsPerWorker - 1;

      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: minPort,
        rtcMaxPort: maxPort
      });

      const workerEntry = {
        worker,
        pid: worker.pid,
        index: i,
        minPort,
        maxPort,
        routers: new Map(), // routerId -> Router
        load: 0
      };

      worker.on('died', () => {
        console.error(`[WorkerPool] Mediasoup Worker index ${i} (PID: ${worker.pid}) DIED!`);
        this.handleWorkerDeath(workerEntry);
      });

      this.workers.push(workerEntry);
      console.log(`[WorkerPool] Worker [${i}] online (PID: ${worker.pid}, Ports: ${minPort}-${maxPort})`);
    }

    this.isInitialized = true;
  }

  /**
   * Handle worker crash and notify supervisor
   */
  async handleWorkerDeath(workerEntry) {
    const deadPid = workerEntry.pid;
    const affectedRouters = Array.from(workerEntry.routers.values());

    // Mark worker dead
    workerEntry.worker = null;
    workerEntry.load = Infinity;

    if (this.onWorkerDiedCallback) {
      this.onWorkerDiedCallback({
        workerIndex: workerEntry.index,
        deadPid,
        affectedRouters
      });
    }

    // Attempt to respawn worker
    try {
      console.log(`[WorkerPool] Respawning worker index ${workerEntry.index}...`);
      const newWorker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: workerEntry.minPort,
        rtcMaxPort: workerEntry.maxPort
      });

      workerEntry.worker = newWorker;
      workerEntry.pid = newWorker.pid;
      workerEntry.routers.clear();
      workerEntry.load = 0;

      newWorker.on('died', () => {
        console.error(`[WorkerPool] Respawned Worker (PID: ${newWorker.pid}) died!`);
        this.handleWorkerDeath(workerEntry);
      });

      console.log(`[WorkerPool] Respawned Worker index ${workerEntry.index} successfully (New PID: ${newWorker.pid})`);
    } catch (err) {
      console.error(`[WorkerPool] Failed to respawn worker index ${workerEntry.index}:`, err);
    }
  }

  /**
   * Select the least-loaded active worker in the pool
   */
  getLeastLoadedWorker() {
    const available = this.workers.filter((w) => w.worker && !w.worker.closed);
    if (available.length === 0) {
      throw new Error('[WorkerPool] No healthy Mediasoup workers available!');
    }

    available.sort((a, b) => a.load - b.load);
    return available[0];
  }

  /**
   * Allocate a new Router on the least-loaded worker
   */
  async createRouter({ mediaCodecs, roomId }) {
    const workerEntry = this.getLeastLoadedWorker();
    const router = await workerEntry.worker.createRouter({ mediaCodecs });

    router.appData = {
      roomId,
      workerIndex: workerEntry.index,
      workerPid: workerEntry.pid
    };

    workerEntry.routers.set(router.id, router);
    workerEntry.load++;

    router.on('@close', () => {
      workerEntry.routers.delete(router.id);
      workerEntry.load = Math.max(0, workerEntry.load - 1);
    });

    return {
      router,
      workerIndex: workerEntry.index,
      workerPid: workerEntry.pid
    };
  }

  /**
   * Get telemetry stats across all workers
   */
  getStats() {
    return this.workers.map((w) => ({
      index: w.index,
      pid: w.pid,
      activeRouters: w.routers.size,
      load: w.load,
      isAlive: Boolean(w.worker && !w.worker.closed)
    }));
  }

  /**
   * Gracefully close all workers
   */
  close() {
    this.workers.forEach((w) => {
      if (w.worker && !w.worker.closed) {
        w.worker.close();
      }
    });
    this.workers = [];
    this.isInitialized = false;
  }
}
