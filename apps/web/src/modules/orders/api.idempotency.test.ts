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
});
