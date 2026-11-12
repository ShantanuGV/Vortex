/**
 * Strict Input Sanitization & Anti-XSS Utilities
 */

export function sanitizeString(str, maxLength = 80) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>'"&]/g, (c) => ({
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
      '&': '&amp;'
    }[c]))
    .trim()
    .slice(0, maxLength);
}

export function sanitizeRoomId(roomId) {
  if (typeof roomId !== 'string') return '';
  return roomId
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 64);
}

export function sanitizeChatMessage(message, maxLength = 1000) {
  if (typeof message !== 'string') return '';
  return sanitizeString(message, maxLength);
}
