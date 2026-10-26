import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/http/client.js';
import { fetchClients } from './api.js';

vi.mock('@/shared/http/client.js', () => ({ api: { get: vi.fn() } }));
const clients = [{ id: 'DB:local', name: 'Stored client' }];

describe('client catalog API availability', () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([false, true, undefined])(
    'preserves availability %s and defaults legacy metadata to healthy',
    async (sheetsAvailable) => {
      vi.mocked(api.get).mockResolvedValue({
        data: {
          data: clients,
          meta: {
            fetchedAt: '2026-10-26T12:00:00.000Z',
            total: clients.length,
            ...(sheetsAvailable === undefined ? {} : { sheetsAvailable }),
          },
        },
      });
      expect(await fetchClients('Stored')).toEqual({
        clients,
        fetchedAt: '2026-10-26T12:00:00.000Z',
        sheetsAvailable: sheetsAvailable ?? true,
      });
      expect(api.get).toHaveBeenCalledWith('/external/clients', { params: { search: 'Stored' } });
    },
  );
  it('retains degraded status when no stored clients exist', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { data: [], meta: { fetchedAt: 'now', total: 0, sheetsAvailable: false } },
    });
    expect(await fetchClients()).toMatchObject({ clients: [], sheetsAvailable: false });
  });
});
