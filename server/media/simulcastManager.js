/**
 * Mediasoup Simulcast Layer Selection & Adaptation Manager
 */

export class SimulcastManager {
  /**
   * Apply target simulcast spatial/temporal layers to an active consumer
   * @param {Object} consumer Mediasoup Consumer
   * @param {number} spatialLayer
   * @param {number} temporalLayer
   */
  static async setConsumerLayers(consumer, spatialLayer = 2, temporalLayer = 2) {
    if (!consumer || consumer.closed) return;
    if (consumer.type !== 'simulcast') return;

    try {
      await consumer.setPreferredLayers({
        spatialLayer,
        temporalLayer
      });
    } catch (err) {
      console.warn(`[SimulcastManager] Error setting layers on consumer ${consumer.id}:`, err.message);
    }
  }

  /**
   * Dynamically adjust active room consumers based on subscription plan
   * @param {Object} room Room instance
   * @param {string} receiverId Receiver peer ID
   * @param {Array<Object>} desiredSubscriptions Output from SubscriptionEngine
   */
  static async applySubscriptionPlan(room, receiverId, desiredSubscriptions) {
    if (!room || !room.consumers) return;

    const desiredProducers = new Map(desiredSubscriptions.map((d) => [d.producerId, d]));

    for (const consumerEntry of room.consumers.values()) {
      // Check if this consumer belongs to the target receiver and is video
      if (consumerEntry.peerId === receiverId && consumerEntry.consumer.kind === 'video') {
        const producerId = consumerEntry.producerId;
        const targetConfig = desiredProducers.get(producerId);

        if (targetConfig) {
          // If paused, resume
          if (consumerEntry.consumer.paused) {
            await consumerEntry.consumer.resume();
          }
          // Set preferred layer
          await this.setConsumerLayers(
            consumerEntry.consumer,
            targetConfig.spatialLayer,
            targetConfig.temporalLayer
          );
        } else {
          // Not in active budget: pause consumer to conserve bandwidth
          if (!consumerEntry.consumer.paused) {
            await consumerEntry.consumer.pause();
          }
        }
      }
    }
  }
}
