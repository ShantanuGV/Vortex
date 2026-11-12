/**
 * Meeting Roles, Policies & Permission Management Service
 */

export const ROLES = {
  HOST: 'host',
  CO_HOST: 'co-host',
  PARTICIPANT: 'participant',
  AUDIENCE: 'audience'
};

export const MEETING_MODES = {
  CONFERENCE: 'conference', // Normal group meeting: all admitted participants can produce/consume
  WEBINAR: 'webinar'        // Host-centric broadcast: non-hosts only see host and self
};

export class PermissionService {
  /**
   * Check if participant can act as meeting admin
   */
  static isMeetingAdmin(room, socketId) {
    if (!room || !socketId) return false;
    if (room.hostId === socketId) return true;
    const participant = room.participants.get(socketId);
    return participant?.role === ROLES.CO_HOST;
  }

  /**
   * Check if peer has permission to publish a specific media type
   */
  static canPublish(room, socketId, mediaType) {
    if (!room || !room.participants.has(socketId)) return false;
    const participant = room.participants.get(socketId);
    const isAdmin = this.isMeetingAdmin(room, socketId);

    // Admins always have publish permissions
    if (isAdmin) return true;

    // Check room policies for non-admin participants
    const settings = room.settings || {};
    if (mediaType === 'audio' || mediaType === 'mic') {
      return settings.allowMic !== false && !participant.forceMuted;
    }
    if (mediaType === 'video' || mediaType === 'camera') {
      return settings.allowCamera !== false && !participant.forceVideoDisabled;
    }
    if (mediaType === 'screen') {
      return settings.allowScreenShare !== false;
    }
    return false;
  }

  /**
   * Determine if consumer is authorized to consume a producer's media track
   */
  static canConsume(room, consumerPeerId, producerEntry) {
    if (!room || !consumerPeerId || !producerEntry) return false;
    if (!room.participants.has(consumerPeerId)) return false;

    // A peer should never consume their own producer
    if (producerEntry.peerId === consumerPeerId) return false;

    // In conference mode: all admitted participants may consume any producer
    const mode = room.settings?.mode || MEETING_MODES.CONFERENCE;
    if (mode === MEETING_MODES.CONFERENCE) {
      return true;
    }

    // In webinar mode: host/co-hosts see everyone; non-hosts only see host/co-hosts
    const consumerIsAdmin = this.isMeetingAdmin(room, consumerPeerId);
    if (consumerIsAdmin) return true;

    const producerIsAdmin = this.isMeetingAdmin(room, producerEntry.peerId);
    return producerIsAdmin;
  }
}

