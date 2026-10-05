import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeBlobDigest } from './digest.js';

describe('computeBlobDigest', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
        writable: true,
      });
    }
  });

  it('uses crypto.subtle.digest when available (secure contexts)', async () => {
    const blob = new Blob(['sample-data'], { type: 'text/plain' });
    const digest = await computeBlobDigest(blob);

    expect(typeof digest).toBe('string');
    // SHA-256 in hex is 64 characters
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to deterministic FNV-1a hash when crypto.subtle is undefined (insecure contexts)', async () => {
    // Non-secure context simulation: crypto exists, but subtle is undefined
    vi.stubGlobal('crypto', {
      ...originalCrypto,
      subtle: undefined,
    });

    const blob = new Blob(['sample-data'], { type: 'text/plain' });
    const digest = await computeBlobDigest(blob);

    expect(typeof digest).toBe('string');
    expect(digest.length).toBeGreaterThan(0);
    // Should be format: `${size.toString(16)}-${hash}`
    expect(digest).toMatch(/^[0-9a-f]+-[0-9a-f]{8}$/);
  });

  it('produces identical fallback digests for identical blob content', async () => {
    vi.stubGlobal('crypto', {
      ...originalCrypto,
      subtle: undefined,
    });

    const blob1 = new Blob(['repeatable-content-123'], { type: 'image/png' });
    const blob2 = new Blob(['repeatable-content-123'], { type: 'image/png' });

    const digest1 = await computeBlobDigest(blob1);
    const digest2 = await computeBlobDigest(blob2);

    expect(digest1).toBe(digest2);
  });

  it('produces different fallback digests for different blob contents', async () => {
    vi.stubGlobal('crypto', {
      ...originalCrypto,
      subtle: undefined,
    });

    const blob1 = new Blob(['content-alpha'], { type: 'image/png' });
    const blob2 = new Blob(['content-beta'], { type: 'image/png' });

    const digest1 = await computeBlobDigest(blob1);
    const digest2 = await computeBlobDigest(blob2);

    expect(digest1).not.toBe(digest2);
  });
});
