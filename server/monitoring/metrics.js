import os from 'os';

/**
 * Enterprise Metrics Collector & Telemetry Provider
 * Aggregates runtime statistics for Prometheus monitoring and HTTP probes
 */
export class MetricsCollector {
  constructor() {
    this.counters = {
      reconnectionsTotal: 0,
      workerFailuresTotal: 0,
      transportCreationTotal: 0,
      producersCreatedTotal: 0,
      consumersCreatedTotal: 0,
      rateLimitViolationsTotal: 0
    };
  }

  increment(metricName, value = 1) {
    if (this.counters[metricName] !== undefined) {
      this.counters[metricName] += value;
    }
  }

  /**
   * Produce comprehensive system telemetry payload
   */
  getSystemMetrics({ roomManager, workerPool, mediaNode }) {
    const memory = process.memoryUsage();
    const cpus = os.cpus();
    const nodeStats = mediaNode ? mediaNode.getTelemetry() : {};

    let totalParticipants = 0;
    let totalTransports = 0;
    let totalProducers = 0;
    let totalConsumers = 0;
    const roomDetails = [];

    if (roomManager && roomManager.localRooms) {
      roomManager.localRooms.forEach((room) => {
        totalParticipants += room.participants.size;
        totalTransports += room.transports.size;
        totalProducers += room.producers.size;
        totalConsumers += room.consumers.size;

        roomDetails.push({
          roomId: room.id,
          hostId: room.hostId,
          participants: room.participants.size,
          transports: room.transports.size,
          producers: room.producers.size,
          consumers: room.consumers.size,
          workerIndex: room.workerIndex,
          workerPid: room.workerPid,
          uptimeSec: Math.floor((Date.now() - room.createdAt) / 1000)
        });
      });
    }

    return {
      system: {
        platform: os.platform(),
        cpuCores: cpus.length,
        cpuModel: cpus[0]?.model || 'Unknown',
        totalRamGB: +(os.totalmem() / 1024 ** 3).toFixed(2),
        freeRamGB: +(os.freemem() / 1024 ** 3).toFixed(2),
        processMemoryMB: {
          rss: Math.round(memory.rss / (1024 * 1024)),
          heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
          heapTotal: Math.round(memory.heapTotal / (1024 * 1024))
        }
      },
      fabric: {
        nodeId: mediaNode?.nodeId || 'standalone',
        activeRooms: roomManager?.localRooms?.size || 0,
        totalParticipants,
        totalTransports,
        totalProducers,
        totalConsumers,
        activeWorkers: workerPool?.workers?.length || 0,
        counters: this.counters
      },
      rooms: roomDetails,
      node: nodeStats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Prometheus standard metrics string format
   */
  toPrometheusFormat(data) {
    return `
# HELP vortex_active_rooms Current number of active conference rooms
# TYPE vortex_active_rooms gauge
vortex_active_rooms ${data.fabric.activeRooms}

# HELP vortex_active_participants Current number of connected participants
# TYPE vortex_active_participants gauge
vortex_active_participants ${data.fabric.totalParticipants}

# HELP vortex_active_transports Total active WebRtcTransports
# TYPE vortex_active_transports gauge
vortex_active_transports ${data.fabric.totalTransports}

# HELP vortex_active_producers Total active Mediasoup Producers
# TYPE vortex_active_producers gauge
vortex_active_producers ${data.fabric.totalProducers}

# HELP vortex_active_consumers Total active Mediasoup Consumers
# TYPE vortex_active_consumers gauge
vortex_active_consumers ${data.fabric.totalConsumers}

# HELP vortex_worker_failures_total Total worker death events
# TYPE vortex_worker_failures_total counter
vortex_worker_failures_total ${data.fabric.counters.workerFailuresTotal}

# HELP vortex_memory_heap_used_bytes Process heap memory usage in bytes
# TYPE vortex_memory_heap_used_bytes gauge
vortex_memory_heap_used_bytes ${data.system.processMemoryMB.heapUsed * 1024 * 1024}
`.trim();
  }
}

