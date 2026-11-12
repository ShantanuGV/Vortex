import crypto from 'crypto';

/**
 * Participant Session & Presence Manager
 * Manages participant lifecycles, presence heartbeats, and grace-period reconnection.
 */
export class SessionManager {
  constructor(distributedState, options = {}) {
    this.state = distributedState;
    this.gracePeriodMs = options.gracePeriodMs || 30000; // 30-second reconnection window
    this.graceTimers = new Map(); // peerId -> timer
  }

  /**
   * Create or update a participant session
   */
  async createSession({ peerId, roomId, userName, role, isHost = false, signalingNodeId }) {
    const reconnectToken = crypto.randomBytes(24).toString('hex');
    const session = {
      peerId,
      roomId,
      userName,
      role,
      isHost,
      signalingNodeId,
      reconnectToken,
      connectionState: 'connected',
      joinedAt: Date.now(),
      lastSeenAt: Date.now()
    };

    // Store session with 1-hour TTL
    await this.state.set(`session:${peerId}`, session, 3600);
    // Index reconnectToken -> peerId
    await this.state.set(`token:${reconnectToken}`, peerId, 3600);
    // Add to room's participant set
    await this.state.sadd(`room:${roomId}:peers`, peerId);

    // Cancel any existing grace timer if peer reconnected
    if (this.graceTimers.has(peerId)) {
      clearTimeout(this.graceTimers.get(peerId));
      this.graceTimers.delete(peerId);
    }

    return session;
  }

  /**
   * Handle unexpected participant disconnect (enter grace period)
   * @param {string} peerId
   * @param {Function} onGraceExpired Callback executed if peer fails to reconnect in time
   */
  async handleDisconnect(peerId, onGraceExpired) {
    const session = await this.state.get(`session:${peerId}`);
    if (!session) return;

    session.connectionState = 'disconnected_grace';
    session.lastSeenAt = Date.now();
    await this.state.set(`session:${peerId}`, session, 3600);

    // Start grace period countdown
    const timer = setTimeout(async () => {
      this.graceTimers.delete(peerId);
      console.log(`[SessionManager] Grace period expired for peer ${peerId}. Cleaning up session...`);
      await this.destroySession(peerId);
      if (typeof onGraceExpired === 'function') {
        onGraceExpired(session);
      }
    }, this.gracePeriodMs);

    this.graceTimers.set(peerId, timer);
  }

  /**
   * Validate and restore session during reconnection
   */
  async restoreSession(reconnectToken, newSocketId) {
    if (!reconnectToken) return null;

    const oldPeerId = await this.state.get(`token:${reconnectToken}`);
    if (!oldPeerId) return null;

    const session = await this.state.get(`session:${oldPeerId}`);
    if (!session) return null;

    // Clear grace timer
    if (this.graceTimers.has(oldPeerId)) {
      clearTimeout(this.graceTimers.get(oldPeerId));
      this.graceTimers.delete(oldPeerId);
    }

    // Update session with new socket ID if changed
    if (newSocketId && newSocketId !== oldPeerId) {
      await this.destroySession(oldPeerId);
      session.peerId = newSocketId;
      session.connectionState = 'connected';
      session.lastSeenAt = Date.now();
      await this.state.set(`session:${newSocketId}`, session, 3600);
      await this.state.set(`token:${reconnectToken}`, newSocketId, 3600);
      await this.state.sadd(`room:${session.roomId}:peers`, newSocketId);
    } else {
      session.connectionState = 'connected';
      session.lastSeenAt = Date.now();
      await this.state.set(`session:${oldPeerId}`, session, 3600);
    }

    return session;
  }

  /**
   * Remove participant session completely
   */
  async destroySession(peerId) {
    const session = await this.state.get(`session:${peerId}`);
    if (session) {
      if (session.reconnectToken) {
        await this.state.del(`token:${session.reconnectToken}`);
      }
      await this.state.srem(`room:${session.roomId}:peers`, peerId);
    }
    await this.state.del(`session:${peerId}`);

    if (this.graceTimers.has(peerId)) {
      clearTimeout(this.graceTimers.get(peerId));
      this.graceTimers.delete(peerId);
    }
  }

  /**
   * Get active participant count for a room
   */
  async getRoomPeerCount(roomId) {
    const peers = await this.state.smembers(`room:${roomId}:peers`);
    return peers.length;
  }
}
