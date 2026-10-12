import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as clientApi from './api.js';
import { fetchClients } from '@/modules/external-catalogs';
import { useClients } from './useClients.js';
vi.mock('./api.js', () => ({
  listClients: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  addClientEmail: vi.fn(),
  updateClientEmail: vi.fn(),
  deleteClientEmail: vi.fn(),
}));
vi.mock('@/modules/external-catalogs', () => ({ fetchClients: vi.fn() }));
const client = { id: 'client-1', clientSheetId: 'C1', name: 'Client', emails: [] };
describe('client management state', () => {
  beforeEach(() => vi.resetAllMocks());
  it('loads clients and catalog independently and selects the first client', async () => {
    vi.mocked(clientApi.listClients).mockResolvedValue([client]);
    vi.mocked(fetchClients).mockResolvedValue({
      clients: [{ id: 'C1', name: 'Sheets' }],
      fetchedAt: 'now',
    });
    const state = useClients();
    const pending = state.load();
    expect(state.loading.value).toBe(true);
    await pending;
    await state.loadCatalog();
    expect(state.selected.value).toEqual(client);
    expect(state.catalog.value).toEqual([{ id: 'C1', name: 'Sheets' }]);
    expect(state.loading.value).toBe(false);
    expect(state.catalogLoading.value).toBe(false);
  });
  it('registers and renames a client without editing Sheets', async () => {
    const state = useClients();
    vi.mocked(clientApi.createClient).mockResolvedValue(client);
    vi.mocked(clientApi.updateClient).mockResolvedValue({ ...client, name: 'Renamed' });
    expect(await state.register('C1', 'Client')).toBe(true);
    expect(state.selected.value?.id).toBe(client.id);
    expect(await state.rename(client.id, 'Renamed')).toBe(true);
    expect(state.selected.value?.name).toBe('Renamed');
    expect(clientApi.createClient).toHaveBeenCalledWith({ clientSheetId: 'C1', name: 'Client' });
    expect(clientApi.updateClient).toHaveBeenCalledWith(client.id, { name: 'Renamed' });
    expect(fetchClients).not.toHaveBeenCalled();
  });
  it('adds, edits, and deletes recipients while retaining selection', async () => {
    const state = useClients();
    state.clients.value = [{ ...client, emails: [] }];
    state.selectedId.value = client.id;
    vi.mocked(clientApi.addClientEmail).mockResolvedValue({
      id: 'email-1',
      email: 'a@example.com',
    });
    vi.mocked(clientApi.updateClientEmail).mockResolvedValue({
      id: 'email-1',
      email: 'b@example.com',
    });
    vi.mocked(clientApi.deleteClientEmail).mockResolvedValue();
    expect(await state.saveEmail(client.id, 'a@example.com')).toBe(true);
    expect(state.selected.value?.emails).toEqual([{ id: 'email-1', email: 'a@example.com' }]);
    expect(await state.saveEmail(client.id, 'b@example.com', 'email-1')).toBe(true);
    expect(state.selected.value?.emails).toEqual([{ id: 'email-1', email: 'b@example.com' }]);
    expect(await state.removeEmail(client.id, 'email-1')).toBe(true);
    expect(state.selected.value?.emails).toEqual([]);
    expect(state.selectedId.value).toBe(client.id);
  });
  it('retains stored clients when the Sheets catalog is unavailable', async () => {
    vi.mocked(clientApi.listClients).mockResolvedValue([client]);
    vi.mocked(fetchClients).mockRejectedValue(new Error('offline'));
    const state = useClients();
    await Promise.all([state.load(), state.loadCatalog()]);
    expect(state.error.value).toBeNull();
    expect(state.catalogError.value).toContain('Google Sheets');
    expect(state.clients.value).toEqual([client]);
  });
  it('reports list/save failures and clears loading flags without changing data', async () => {
    vi.mocked(clientApi.listClients).mockRejectedValue(new Error('list failed'));
    vi.mocked(clientApi.addClientEmail).mockRejectedValue(new Error('duplicate'));
    const state = useClients();
    await state.load();
    expect(state.error.value).toBe('list failed');
    expect(state.loading.value).toBe(false);
    state.clients.value = [{ ...client, emails: [] }];
    expect(await state.saveEmail(client.id, 'a@example.com')).toBe(false);
    expect(state.formError.value).toBe('duplicate');
    expect(state.clients.value[0]?.emails).toEqual([]);
    expect(state.saving.value).toBe(false);
  });
  it('rejects malformed email locally with Spanish feedback', async () => {
    const state = useClients();
    expect(await state.saveEmail(client.id, 'invalid')).toBe(false);
    expect(state.formError.value).toBe('Ingresa un correo con formato válido.');
    expect(clientApi.addClientEmail).not.toHaveBeenCalled();
  });

  it('prevents double submission while a save is pending', async () => {
    let finish!: (value: typeof client) => void;
    vi.mocked(clientApi.createClient).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const state = useClients();
    const first = state.register('C1', 'Client');
    expect(state.saving.value).toBe(true);
    expect(await state.register('C1', 'Client')).toBe(false);
    expect(clientApi.createClient).toHaveBeenCalledOnce();
    finish(client);
    expect(await first).toBe(true);
    expect(state.saving.value).toBe(false);
  });
});
