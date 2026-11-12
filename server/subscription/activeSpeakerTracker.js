/**
 * Active Speaker Tracker with Speech History & Hysteresis
 */

export class ActiveSpeakerTracker {
  constructor(options = {}) {
    this.decayWindowMs = options.decayWindowMs || 8000; // 8-second recent speaker window
    this.currentSpeakerId = null;
    this.recentSpeakers = new Map(); // peerId -> lastSpokeTimestamp
  }

  /**
   * Process incoming VAD speech level from a participant
   * @param {string} peerId
   * @param {number} level 0.0 to 1.0
   * @returns {boolean} true if primary speaker changed
   */
  processSpeakingLevel(peerId, level) {
    const now = Date.now();
    const isSpeaking = level > 0.15;

    if (isSpeaking) {
      this.recentSpeakers.set(peerId, now);

      if (this.currentSpeakerId !== peerId) {
        this.currentSpeakerId = peerId;
        return true; // Primary speaker switched
      }
    } else if (this.currentSpeakerId === peerId) {
      // Current speaker stopped speaking
      this.currentSpeakerId = null;
      return true;
    }

    return false;
  }

  /**
   * Remove a participant on disconnect
   */
  removeParticipant(peerId) {
    this.recentSpeakers.delete(peerId);
    if (this.currentSpeakerId === peerId) {
      this.currentSpeakerId = null;
    }
  }

  /**
   * Get sorted list of recent speakers within the decay window
   */
  getRecentSpeakers() {
    const now = Date.now();
    const active = [];

    this.recentSpeakers.forEach((timestamp, peerId) => {
      if (now - timestamp < this.decayWindowMs) {
        active.push({ peerId, timestamp });
      } else {
        this.recentSpeakers.delete(peerId);
      }
    });

    active.sort((a, b) => b.timestamp - a.timestamp);
    return active.map((s) => s.peerId);
  }

  getCurrentSpeaker() {
    return this.currentSpeakerId;
  }
}

