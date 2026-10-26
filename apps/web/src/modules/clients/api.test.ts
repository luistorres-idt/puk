import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/http/client.js';
import {
  addClientEmail,
  createClient,
  deleteClientEmail,
  getClient,
  listClients,
  updateClient,
  updateClientEmail,
} from './api.js';
vi.mock('@/shared/http/client.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
const client = { id: 'client-1', clientSheetId: 'C1', name: 'Client', emails: [] };
describe('client management API adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const method of [api.get, api.post, api.patch])
      vi.mocked(method).mockResolvedValue({ data: { data: client } } as never);
  });
  it('lists and fetches stored clients separately from external catalog', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { data: [client] } } as never);
    await expect(listClients()).resolves.toEqual([client]);
    await expect(getClient(client.id)).resolves.toEqual(client);
    expect(api.get).toHaveBeenCalledWith('/clients');
    expect(api.get).toHaveBeenCalledWith('/clients/client-1');
  });
  it('sends explicit create and immutable-identity update bodies', async () => {
    await expect(createClient({ name: 'Client' })).resolves.toEqual(client);
    await updateClient(client.id, { name: 'Renamed' });
    expect(api.post).toHaveBeenCalledWith('/clients', { name: 'Client' });
    expect(api.patch).toHaveBeenCalledWith('/clients/client-1', { name: 'Renamed' });
  });
  it('scopes recipient create/edit/delete to their owning client', async () => {
    await addClientEmail(client.id, { email: 'a@example.com' });
    await updateClientEmail(client.id, 'email-1', { email: 'b@example.com' });
    await deleteClientEmail(client.id, 'email-1');
    expect(api.post).toHaveBeenCalledWith('/clients/client-1/emails', { email: 'a@example.com' });
    expect(api.patch).toHaveBeenCalledWith('/clients/client-1/emails/email-1', {
      email: 'b@example.com',
    });
    expect(api.delete).toHaveBeenCalledWith('/clients/client-1/emails/email-1');
  });
});
