import { afterEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import { generateUuid } from './uuid.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidSchema = v.pipe(v.string(), v.uuid());

describe('generateUuid', () => {
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

  it('delegates to native crypto.randomUUID when available', () => {
    const mockRandomUuid = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    vi.stubGlobal('crypto', {
      ...originalCrypto,
      randomUUID: mockRandomUuid,
    });

    const result = generateUuid();
    expect(result).toBe('11111111-2222-4333-8444-555555555555');
    expect(mockRandomUuid).toHaveBeenCalledTimes(1);
    expect(v.is(uuidSchema, result)).toBe(true);
  });

  it('falls back to crypto.getRandomValues in non-secure contexts where randomUUID is undefined', () => {
    // Non-secure context simulation: crypto exists, but randomUUID is undefined
    vi.stubGlobal('crypto', {
      getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      randomUUID: undefined,
    });

    const result = generateUuid();
    expect(result).toMatch(UUID_V4_REGEX);
    expect(v.is(uuidSchema, result)).toBe(true);
  });

  it('falls back to Math.random when crypto is undefined', () => {
    // Total fallback simulation: no crypto object
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const result = generateUuid();
    expect(result).toMatch(UUID_V4_REGEX);
    expect(v.is(uuidSchema, result)).toBe(true);
  });

  it('generates distinct valid UUIDs on multiple calls', () => {
    const results = new Set(Array.from({ length: 50 }, () => generateUuid()));
    expect(results.size).toBe(50);
    for (const id of results) {
      expect(v.is(uuidSchema, id)).toBe(true);
    }
  });
});
