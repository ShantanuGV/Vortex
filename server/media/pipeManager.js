/**
 * PipeTransport Inter-Worker & Cross-Host Media Forwarding Manager
 * Manages Mediasoup PipeTransports to route audio/video streams across workers and nodes
 */
export class PipeManager {
  constructor() {
    // Cache active inter-router pipe pairs: `${sourceRouterId}:${targetRouterId}` -> { pipeConsumer, pipeProducer }
    this.pipes = new Map();
  }

  /**
   * Pipe a producer from a source router to a target router (local multi-worker)
   * Uses Mediasoup's built-in pipeToRouter() API
   * @param {Object} sourceRouter Source Mediasoup Router
   * @param {Object} targetRouter Target Mediasoup Router
   * @param {string} producerId ID of the producer to pipe
   */
  async pipeProducerLocal({ sourceRouter, targetRouter, producerId }) {
    if (!sourceRouter || !targetRouter || !producerId) {
      throw new Error('[PipeManager] Invalid arguments for pipeProducerLocal');
    }

    if (sourceRouter.id === targetRouter.id) {
      // Both belong to the same router; no pipe needed
      return { sourceRouterId: sourceRouter.id, targetRouterId: targetRouter.id, piped: false };
    }

    const pipeKey = `${sourceRouter.id}:${targetRouter.id}:${producerId}`;
    if (this.pipes.has(pipeKey)) {
      return this.pipes.get(pipeKey);
    }

    try {
      const { pipeConsumer, pipeProducer } = await sourceRouter.pipeToRouter({
        producerId,
        router: targetRouter
      });

      const entry = {
        pipeKey,
        pipeConsumer,
        pipeProducer,
        piped: true
      };

      this.pipes.set(pipeKey, entry);

      pipeConsumer.on('transportclose', () => this.pipes.delete(pipeKey));
      pipeProducer.on('transportclose', () => this.pipes.delete(pipeKey));

      return entry;
    } catch (err) {
      console.error(`[PipeManager] Failed to pipe producer ${producerId} to router ${targetRouter.id}:`, err);
      throw err;
    }
  }

  /**
   * Create an explicit PipeTransport for cross-host forwarding
   * @param {Object} router Mediasoup Router
   * @param {Object} options { listenIp, enableSctp }
   */
  async createCrossHostPipeTransport(router, options = {}) {
    const listenIp = options.listenIp || process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0';
    const announcedIp = options.announcedIp || process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1';

    const transport = await router.createPipeTransport({
      listenInfo: {
        protocol: 'udp',
        ip: listenIp,
        announcedAddress: announcedIp
      },
      enableSctp: options.enableSctp ?? true,
      numSctpStreams: { OS: 1024, MIS: 1024 }
    });

    return {
      transport,
      ip: announcedIp,
      port: transport.tuple.localPort
    };
  }

  /**
   * Connect two cross-host PipeTransports and pipe a producer
   */
  async connectCrossHostPipes({ sourceTransport, targetIp, targetPort, producerId, targetTransport }) {
    // Connect source pipe transport to target remote tuple
    await sourceTransport.connect({
      ip: targetIp,
      port: targetPort
    });

    // Create consumer on source pipe transport
    const pipeConsumer = await sourceTransport.consume({ producerId });

    // Produce on target pipe transport
    const pipeProducer = await targetTransport.produce({
      id: pipeConsumer.id,
      kind: pipeConsumer.kind,
      rtpParameters: pipeConsumer.rtpParameters,
      paused: pipeConsumer.producerPaused,
      appData: pipeConsumer.appData
    });

    return { pipeConsumer, pipeProducer };
  }

  /**
   * Clean up all pipes associated with a router
   */
  removeRouterPipes(routerId) {
    this.pipes.forEach((entry, key) => {
      if (key.includes(routerId)) {
        try { entry.pipeConsumer.close(); } catch {}
        try { entry.pipeProducer.close(); } catch {}
        this.pipes.delete(key);
      }
    });
  }
}
