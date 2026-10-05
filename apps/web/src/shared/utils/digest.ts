/**
 * Computes a hex fingerprint from a Blob.
 *
 * In secure contexts (HTTPS or localhost), delegates to `crypto.subtle.digest('SHA-256', ...)`.
 * In non-secure contexts (plain HTTP on remote servers), `crypto.subtle` is undefined
 * per the W3C Web Cryptography specification. In that scenario, falls back to a deterministic
 * FNV-1a hash over the buffer bytes combined with the blob size to prevent runtime crashes.
 */
export async function computeBlobDigest(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());

  if (
    typeof crypto !== 'undefined' &&
    crypto.subtle &&
    typeof crypto.subtle.digest === 'function'
  ) {
    try {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
      return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fall through to deterministic fallback if subtle.digest fails
    }
  }

  // 32-bit FNV-1a hash over the buffer bytes
  let hash = 2166136261;
  for (let i = 0; i < buffer.length; i++) {
    hash ^= buffer[i] ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return `${blob.size.toString(16)}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
