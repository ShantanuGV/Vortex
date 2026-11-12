/**
 * Virtual Media Stream (VMS) Abstraction
 * 
 * Architectural Concept:
 * In large-scale video conferencing (such as Google Meet's publicly documented virtual stream architecture),
 * receivers do not maintain an unbound number of downstream WebRTC video consumers.
 * Instead, the application maintains a logical pool of "Virtual Slots" (e.g. 1 Screen slot + 6 Video slots).
 * 
 * Key Distinctions:
 * 1. Logical Virtual Media Stream (VMS):
 *    A receiver-centric slotting model that maps the most relevant physical Mediasoup Producers
 *    into a fixed set of downstream delivery slots based on priority (Screen > Pinned > Active Speaker > Visible Tiles).
 *    Unselected producers are paused on the SFU to avoid wasted downlink bandwidth.
 * 
 * 2. Combined RTP Stream (MCU Video Mixing):
 *    Decoding multiple video feeds into an RGB canvas, recomposing them into a single video frame,
 *    and re-encoding into a single RTP stream. This requires massive server GPU/CPU transcoders and strips
 *    the client of individual participant DOM layout control.
 * 
 * 3. Standard Mediasoup SFU Producer & Consumer:
 *    Selective forwarding of individual RTP packets at the network layer without transcoding.
 */

export class VirtualSlot {
  constructor(slotId, mediaType = 'video') {
    this.slotId = slotId;
    this.mediaType = mediaType; // 'audio' | 'video' | 'screen'
    this.boundProducerId = null;
    this.boundPeerId = null;
    this.boundConsumerId = null;
    this.spatialLayer = 2;
    this.temporalLayer = 2;
    this.reason = 'idle';
  }

  bind({ producerId, peerId, consumerId, spatialLayer = 2, temporalLayer = 2, reason = 'active' }) {
    this.boundProducerId = producerId;
    this.boundPeerId = peerId;
    this.boundConsumerId = consumerId;
    this.spatialLayer = spatialLayer;
    this.temporalLayer = temporalLayer;
    this.reason = reason;
  }

  unbind() {
    this.boundProducerId = null;
    this.boundPeerId = null;
    this.boundConsumerId = null;
    this.reason = 'idle';
  }

  isOccupied() {
    return this.boundProducerId !== null;
  }
}

export class VirtualMediaStream {
  constructor(receiverId, maxVideoSlots = 6) {
    this.receiverId = receiverId;
    this.maxVideoSlots = maxVideoSlots;
    this.audioSlot = new VirtualSlot('slot-audio', 'audio');
    this.screenSlot = new VirtualSlot('slot-screen', 'video');
    this.videoSlots = [];

    for (let i = 0; i < maxVideoSlots; i++) {
      this.videoSlots.push(new VirtualSlot(`slot-video-${i}`, 'video'));
    }
  }

  /**
   * Rebalance virtual slots to match the evaluated subscription plan
   * @param {Array<Object>} desiredSubscriptions Output from SubscriptionEngine
   * @returns {Object} { allocations: Array, unmapped: Array }
   */
  updateSlots(desiredSubscriptions) {
    const allocations = [];
    const desiredMap = new Map(desiredSubscriptions.map((d) => [d.producerId, d]));

    // 1. Process screen share slot
    const screenItem = desiredSubscriptions.find((d) => d.reason === 'screen-share');
    if (screenItem) {
      this.screenSlot.bind(screenItem);
      allocations.push({ slotId: this.screenSlot.slotId, ...screenItem });
      desiredMap.delete(screenItem.producerId);
    } else {
      this.screenSlot.unbind();
    }

    // 2. Process regular video slots
    const remainingItems = Array.from(desiredMap.values());
    for (let i = 0; i < this.videoSlots.length; i++) {
      const slot = this.videoSlots[i];
      if (i < remainingItems.length) {
        const item = remainingItems[i];
        slot.bind(item);
        allocations.push({ slotId: slot.slotId, ...item });
      } else {
        slot.unbind();
      }
    }

    return {
      allocations,
      activeSlotCount: allocations.length,
      screenActive: this.screenSlot.isOccupied()
    };
  }

  /**
   * Get current state of all virtual slots
   */
  getSlotStatus() {
    return {
      receiverId: this.receiverId,
      screenSlot: {
        isOccupied: this.screenSlot.isOccupied(),
        boundProducerId: this.screenSlot.boundProducerId,
        boundPeerId: this.screenSlot.boundPeerId
      },
      videoSlots: this.videoSlots.map((s) => ({
        slotId: s.slotId,
        isOccupied: s.isOccupied(),
        boundProducerId: s.boundProducerId,
        boundPeerId: s.boundPeerId,
        reason: s.reason,
        spatialLayer: s.spatialLayer
      }))
    };
  }
}

