import crypto from 'crypto';
import os from 'os';

/**
 * Media Node Representation & Identity
 * Represents a logical or physical media host running a Mediasoup WorkerPool
 */
export class MediaNode {
  constructor(options = {}) {
    this.nodeId = options.nodeId || `media-node-${os.hostname()}-${crypto.randomBytes(4).toString('hex')}`;
    this.workerPool = options.workerPool || null;
    this.status = 'healthy'; // 'healthy' | 'draining' | 'failed'
    this.createdAt = Date.now();
    this.lastHeartbeat = Date.now();
  }

  /**
   * Set worker pool reference
   */
  setWorkerPool(pool) {
    this.workerPool = pool;
  }

  /**
   * Generate current node health and capacity telemetry
   */
  getTelemetry() {
    const memory = process.memoryUsage();
    const cpus = os.cpus();
    const workerStats = this.workerPool ? this.workerPool.getStats() : [];

    let totalRouters = 0;
    let totalLoad = 0;
    workerStats.forEach((w) => {
      totalRouters += w.activeRouters;
      totalLoad += w.load;
    });

    return {
      nodeId: this.nodeId,
      status: this.status,
      hostName: os.hostname(),
      uptimeSec: Math.floor((Date.now() - this.createdAt) / 1000),
      cpuCores: cpus.length,
      workersCount: workerStats.length,
      activeRouters: totalRouters,
      totalLoad,
      memory: {
        rssMB: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMB: Math.round(memory.heapUsed / (1024 * 1024))
      },
      workers: workerStats,
      timestamp: Date.now()
    };
  }

  touch() {
    this.lastHeartbeat = Date.now();
  }
}

