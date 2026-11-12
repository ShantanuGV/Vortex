/**
 * Network Quality Monitor & Adaptive Profile Classifier
 * Analyzes WebRTC & Mediasoup transport telemetry
 */

export const NETWORK_QUALITY = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor',
  CRITICAL: 'critical'
};

export class NetworkMonitor {
  /**
   * Classify network conditions from transport metrics
   * @param {Object} metrics { rttMs, packetLossPct, jitterMs, score }
   * @returns {string} quality tier
   */
  static classify(metrics = {}) {
    const rtt = metrics.rttMs ?? 0;
    const loss = metrics.packetLossPct ?? 0;
    const jitter = metrics.jitterMs ?? 0;
    const score = metrics.score ?? 10;

    if (loss > 15 || rtt > 600 || score <= 3) {
      return NETWORK_QUALITY.CRITICAL;
    }
    if (loss > 5 || rtt > 350 || jitter > 80 || score <= 6) {
      return NETWORK_QUALITY.POOR;
    }
    if (loss > 2 || rtt > 180 || jitter > 40 || score <= 8) {
      return NETWORK_QUALITY.FAIR;
    }
    if (loss > 0.5 || rtt > 80 || jitter > 20) {
      return NETWORK_QUALITY.GOOD;
    }
    return NETWORK_QUALITY.EXCELLENT;
  }

  /**
   * Map network quality tier to recommended simulcast layers and stream budget
   */
  static getQualityProfile(quality) {
    switch (quality) {
      case NETWORK_QUALITY.EXCELLENT:
        return {
          maxVideoStreams: 6,
          preferredSpatialLayerHigh: 2, // 720p
          preferredSpatialLayerTile: 1, // 360p
          enableTemporalLayers: true,
          audioPriorityOnly: false
        };
      case NETWORK_QUALITY.GOOD:
        return {
          maxVideoStreams: 6,
          preferredSpatialLayerHigh: 2,
          preferredSpatialLayerTile: 0, // 180p
          enableTemporalLayers: true,
          audioPriorityOnly: false
        };
      case NETWORK_QUALITY.FAIR:
        return {
          maxVideoStreams: 4,
          preferredSpatialLayerHigh: 1, // 360p
          preferredSpatialLayerTile: 0, // 180p
          enableTemporalLayers: true,
          audioPriorityOnly: false
        };
      case NETWORK_QUALITY.POOR:
        return {
          maxVideoStreams: 2,
          preferredSpatialLayerHigh: 0, // 180p
          preferredSpatialLayerTile: 0,
          enableTemporalLayers: false,
          audioPriorityOnly: false
        };
      case NETWORK_QUALITY.CRITICAL:
      default:
        return {
          maxVideoStreams: 1, // Only active speaker or screen share
          preferredSpatialLayerHigh: 0,
          preferredSpatialLayerTile: 0,
          enableTemporalLayers: false,
          audioPriorityOnly: true // Prioritize audio integrity above all
        };
    }
  }
}

