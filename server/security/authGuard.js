import { PermissionService } from './permissionService.js';

/**
 * Centralized Authorization & Ownership Guard
 * Validates every signaling payload before interacting with Mediasoup C++ objects
 */
export class AuthGuard {
  /**
   * Verify that socket belongs to the active room
   */
  static validateRoomMembership(room, socketId) {
    if (!room) {
      return { ok: false, error: 'Meeting room not found or inactive.' };
    }
    if (!room.participants.has(socketId)) {
      return { ok: false, error: 'Unauthorized: Peer is not an admitted participant in this room.' };
    }
    return { ok: true, participant: room.participants.get(socketId) };
  }

  /**
   * Verify WebRTC Transport ownership
   */
  static validateTransportOwnership(room, transportId, socketId) {
    const membership = this.validateRoomMembership(room, socketId);
    if (!membership.ok) return membership;

    if (!transportId || typeof transportId !== 'string') {
      return { ok: false, error: 'Invalid transport identifier.' };
    }

    const transport = room.transports.get(transportId);
    if (!transport) {
      return { ok: false, error: 'WebRTC Transport does not exist.' };
    }

    if (transport.appData?.peerId !== socketId) {
      return { ok: false, error: 'Access Denied: Transport ownership mismatch.' };
    }

    return { ok: true, transport };
  }

  /**
   * Verify Producer ownership
   */
  static validateProducerOwnership(room, producerId, socketId) {
    const membership = this.validateRoomMembership(room, socketId);
    if (!membership.ok) return membership;

    if (!producerId || typeof producerId !== 'string') {
      return { ok: false, error: 'Invalid producer identifier.' };
    }

    const producerEntry = room.producers.get(producerId);
    if (!producerEntry) {
      return { ok: false, error: 'Producer not found on room router.' };
    }

    if (producerEntry.peerId !== socketId) {
      return { ok: false, error: 'Access Denied: Producer ownership mismatch.' };
    }

    return { ok: true, producerEntry };
  }

  /**
   * Verify Publishing Permission for a requested media track
   */
  static validatePublishPermission(room, socketId, kind, appData = {}) {
    const membership = this.validateRoomMembership(room, socketId);
    if (!membership.ok) return membership;

    const mediaType = appData?.mediaType || kind;
    const canPublish = PermissionService.canPublish(room, socketId, mediaType);
    if (!canPublish) {
      return {
        ok: false,
        error: `Publishing ${mediaType} is prohibited by room policy or host moderation.`
      };
    }

    return { ok: true };
  }

  /**
   * Verify Consumption Authorization
   */
  static validateConsumeAuthorization(room, consumerPeerId, producerId) {
    const membership = this.validateRoomMembership(room, consumerPeerId);
    if (!membership.ok) return membership;

    const producerEntry = room.producers.get(producerId);
    if (!producerEntry) {
      return { ok: false, error: 'Producer not found.' };
    }

    const authorized = PermissionService.canConsume(room, consumerPeerId, producerEntry);
    if (!authorized) {
      return { ok: false, error: 'Not authorized to consume this producer stream in current meeting mode.' };
    }

    return { ok: true, producerEntry };
  }

  /**
   * Verify Host/Admin Moderation Action
   */
  static validateAdminAction(room, socketId) {
    if (!room) return { ok: false, error: 'Room not found.' };
    if (!PermissionService.isMeetingAdmin(room, socketId)) {
      return { ok: false, error: 'Forbidden: Action requires meeting host or co-host authority.' };
    }
    return { ok: true };
  }
}

