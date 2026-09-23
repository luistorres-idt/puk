import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../shared/http/client.js';
import { uploadEvidenceFile, uploadSignatureFile } from './api.js';

vi.mock('../../shared/http/client.js', () => ({ api: { post: vi.fn(), put: vi.fn() } }));

describe('Drive upload idempotency headers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  it('sends the evidence retry key without a client-supplied Drive file ID', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 'evidence-1' } } });
    const blob = new Blob([Uint8Array.from([1])], { type: 'image/jpeg' });
    await uploadEvidenceFile(
      'order-1',
      'unit-1',
      'DASHBOARD',
      blob,
      2,
      3,
      '234edc7a-d596-4b6b-95e4-34107e78485f',
    );
    expect(api.post).toHaveBeenCalledWith(
      '/orders/order-1/units/unit-1/checklist/DASHBOARD/evidence/file',
      blob,
      {
        headers: {
          'Content-Type': 'image/jpeg',
          'X-Image-Width': '2',
          'X-Image-Height': '3',
          'Idempotency-Key': '234edc7a-d596-4b6b-95e4-34107e78485f',
        },
      },
    );
  });

  it('reuses the signature key after a failed response, then clears it on success', async () => {
    vi.mocked(api.put)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ data: { data: { id: 'signature-1' } } });
    const blob = new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' });
    await expect(uploadSignatureFile('order-1', 'Client', blob)).rejects.toThrow('timeout');
    await uploadSignatureFile('order-1', 'Client', blob);
    const firstKey = vi.mocked(api.put).mock.calls[0]?.[2]?.headers?.['Idempotency-Key'];
    const secondKey = vi.mocked(api.put).mock.calls[1]?.[2]?.headers?.['Idempotency-Key'];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondKey).toBe(firstKey);
  });
});
