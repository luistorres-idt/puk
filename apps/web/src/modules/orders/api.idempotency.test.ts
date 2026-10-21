import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateOrder } from '@puk/contracts';
import { api } from '../../shared/http/client.js';
import { createOrder } from './api.js';

vi.mock('../../shared/http/client.js', () => ({ api: { post: vi.fn() } }));
vi.mock('../service-execution/index.js', () => ({ getStorageMode: vi.fn() }));

describe('createOrder idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 'order-1' } } } as never);
  });

  it('sends the submission key in the Idempotency-Key header', async () => {
    const payload = { clientSheetId: 'client-1' } as CreateOrder;

    await createOrder(payload, '00000000-0000-4000-8000-000000000001');

    expect(api.post).toHaveBeenCalledWith('/orders', payload, {
      headers: { 'Idempotency-Key': '00000000-0000-4000-8000-000000000001' },
    });
  });

  it('generates a request key when randomUUID is unavailable', async () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      randomUUID: undefined,
    });

    try {
      await createOrder({ clientSheetId: 'client-1' } as CreateOrder);

      const config = vi.mocked(api.post).mock.calls[0]?.[2];
      expect(config?.headers).toEqual({
        'Idempotency-Key': expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
      });
    } finally {
      vi.stubGlobal('crypto', originalCrypto);
    }
  });
});
