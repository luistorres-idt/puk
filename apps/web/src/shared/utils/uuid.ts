/**
 * Generates a valid RFC 4122 version 4 UUID.
 *
 * In secure contexts (HTTPS or localhost), delegates to `crypto.randomUUID()`.
 * In non-secure contexts (plain HTTP over IP/domain), `crypto.randomUUID` is undefined
 * per the W3C Web Cryptography specification. In that scenario, falls back to
 * `crypto.getRandomValues()` or pseudo-random generation to prevent runtime crashes.
 */
export function generateUuid(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const buffer = new Uint8Array(16);
      crypto.getRandomValues(buffer);
      // Set version 4: bits 12-15 of time_hi_and_version to 0100
      buffer[6] = ((buffer[6] ?? 0) & 0x0f) | 0x40;
      // Set variant: bits 6-7 of clock_seq_hi_and_reserved to 10
      buffer[8] = ((buffer[8] ?? 0) & 0x3f) | 0x80;

      const hex = Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
