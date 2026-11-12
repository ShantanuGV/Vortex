import { NetworkMonitor, NETWORK_QUALITY } from './networkMonitor.js';

/**
 * Intelligent Media Subscription Engine
 * Ranks publishers, selects streams up to receiver budget, and calculates optimal simulcast layers.
 */
export class SubscriptionEngine {
  constructor(options = {}) {
    this.defaultMaxStreams = options.defaultMaxStreams || 6;
  }

  /**
   * Determine the optimal set of producers a receiver should subscribe to
   * @param {Object} params
   *   - receiverId: string
   *   - room: object (contains participants, producers)
   *   - pinnedPeerId: string|null
   *   - activeSpeakerId: string|null
   *   - recentSpeakerIds: Array<string>
   *   - visiblePeerIds: Set<string>
   *   - networkQuality: string
   * @returns {Array<Object>} List of selected producers with target layers:
   *   [{ producerId, peerId, kind, spatialLayer, temporalLayer, reason }]
   */
  evaluateSubscriptions({
    receiverId,
    room,
    pinnedPeerId = null,
    activeSpeakerId = null,
    recentSpeakerIds = [],
    visiblePeerIds = new Set(),
    networkQuality = NETWORK_QUALITY.EXCELLENT
  }) {
    if (!room || !room.producers) return [];

    const profile = NetworkMonitor.getQualityProfile(networkQuality);
    const maxStreams = profile.maxVideoStreams;

    // Collect all candidate video/screen producers in room (excluding receiver's own)
    const candidates = [];
    room.producers.forEach((pEntry, producerId) => {
      if (pEntry.peerId === receiverId) return; // Skip own streams
      if (pEntry.kind !== 'video') return; // Audio is handled independently

      const peerId = pEntry.peerId;
      const isScreen = pEntry.appData?.mediaType === 'screen';
      const isPinned = pinnedPeerId === peerId;
      const isActiveSpeaker = activeSpeakerId === peerId;
      const isRecentSpeaker = recentSpeakerIds.includes(peerId);
      const isVisible = visiblePeerIds.has(peerId);

      // Calculate priority score (lower number = higher priority)
      let priorityScore = 100;
      let reason = 'regular';

      if (isScreen) {
        priorityScore = 1;
        reason = 'screen-share';
      } else if (isPinned) {
        priorityScore = 2;
        reason = 'pinned';
      } else if (isActiveSpeaker) {
        priorityScore = 3;
        reason = 'active-speaker';
      } else if (isRecentSpeaker) {
        priorityScore = 4;
        reason = 'recent-speaker';
      } else if (isVisible) {
        priorityScore = 5;
        reason = 'visible-tile';
      }

      candidates.push({
        producerId,
        peerId,
        kind: pEntry.kind,
        priorityScore,
        reason,
        isHighPriority: isScreen || isPinned || isActiveSpeaker
      });
    });

    // Sort by priority (ascending score)
    candidates.sort((a, b) => a.priorityScore - b.priorityScore);

    // Pick top candidates up to receiver's max stream budget
    const selected = candidates.slice(0, maxStreams).map((item) => {
      // High priority items (screen, pinned, active speaker) get highest spatial layer
      const spatialLayer = item.isHighPriority
        ? profile.preferredSpatialLayerHigh
        : profile.preferredSpatialLayerTile;

      const temporalLayer = profile.enableTemporalLayers ? 2 : 0;

      return {
        producerId: item.producerId,
        peerId: item.peerId,
        kind: item.kind,
        spatialLayer,
        temporalLayer,
        reason: item.reason
      };
    });

    return selected;
  }
}
