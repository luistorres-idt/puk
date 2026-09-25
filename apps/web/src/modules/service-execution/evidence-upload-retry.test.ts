import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvidenceUploadRetryKeys } from './evidence-upload-retry.js';

const storage = new Map<string, string>();
const getItem = vi.fn((key: string) => storage.get(key) ?? null);
const setItem = vi.fn((key: string, value: string) => {
  storage.set(key, value);
});
const removeItem = vi.fn((key: string) => {
  storage.delete(key);
});
const randomUUID = vi.fn(() => 'new-key');

const file = new File(['image'], 'photo.jpg', { lastModified: 123 });
const retryKey = `puk:evidence-upload:order-1:unit-1:${file.name}:${file.size}:${file.lastModified}`;

beforeEach(() => {
  storage.clear();
  getItem.mockReset().mockImplementation((key) => storage.get(key) ?? null);
  setItem.mockReset().mockImplementation((key, value) => {
    storage.set(key, value);
  });
  removeItem.mockReset().mockImplementation((key) => {
    storage.delete(key);
  });
  randomUUID.mockReset().mockReturnValue('new-key');
  vi.stubGlobal('sessionStorage', { getItem, setItem, removeItem });
  vi.stubGlobal('crypto', { randomUUID });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('createEvidenceUploadRetryKeys', () => {
  it('reuses the same key for a retry and persists it for a new component instance', () => {
    const first = createEvidenceUploadRetryKeys();

    expect(first.keyFor('order-1', 'unit-1', file)).toBe('new-key');
    expect(first.keyFor('order-1', 'unit-1', file)).toBe('new-key');
    expect(storage.get(retryKey)).toBe('new-key');
    expect(randomUUID).toHaveBeenCalledTimes(1);

    randomUUID.mockReturnValueOnce('another-key');
    expect(createEvidenceUploadRetryKeys().keyFor('order-1', 'unit-1', file)).toBe('new-key');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('prefers the in-memory key if browser storage changes during a retry', () => {
    const keys = createEvidenceUploadRetryKeys();
    expect(keys.keyFor('order-1', 'unit-1', file)).toBe('new-key');

    storage.set(retryKey, 'different-key');
    expect(keys.keyFor('order-1', 'unit-1', file)).toBe('new-key');
    expect(storage.get(retryKey)).toBe('new-key');
  });

  it('keeps order, unit, and original file metadata in the retry identity', () => {
    const keys = createEvidenceUploadRetryKeys();
    const otherFile = new File(['image'], 'photo.jpg', { lastModified: 124 });

    keys.keyFor('order-1', 'unit-1', file);
    keys.keyFor('order-2', 'unit-1', file);
    keys.keyFor('order-1', 'unit-2', file);
    keys.keyFor('order-1', 'unit-1', otherFile);

    expect(setItem.mock.calls.map(([key]) => key)).toEqual([
      retryKey,
      `puk:evidence-upload:order-2:unit-1:${file.name}:${file.size}:${file.lastModified}`,
      `puk:evidence-upload:order-1:unit-2:${file.name}:${file.size}:${file.lastModified}`,
      `puk:evidence-upload:order-1:unit-1:${otherFile.name}:${otherFile.size}:${otherFile.lastModified}`,
    ]);
  });

  it('retains in-memory retries when session storage is unavailable', () => {
    getItem.mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    setItem.mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    const keys = createEvidenceUploadRetryKeys();

    expect(keys.keyFor('order-1', 'unit-1', file)).toBe('new-key');
    expect(keys.keyFor('order-1', 'unit-1', file)).toBe('new-key');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('clears successful uploads and tolerates storage removal failures', () => {
    const keys = createEvidenceUploadRetryKeys();
    expect(keys.keyFor('order-1', 'unit-1', file)).toBe('new-key');
    keys.clear('order-1', 'unit-1', file);
    expect(removeItem).toHaveBeenCalledWith(retryKey);
    expect(storage.has(retryKey)).toBe(false);

    randomUUID.mockReturnValueOnce('next-key');
    expect(keys.keyFor('order-1', 'unit-1', file)).toBe('next-key');
    removeItem.mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    expect(() => keys.clear('order-1', 'unit-1', file)).not.toThrow();
  });
});
