import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as clientApi from './api.js';
import { useClients } from './useClients.js';
vi.mock('./api.js', () => ({
  listClients: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  addClientEmail: vi.fn(),
  updateClientEmail: vi.fn(),
  deleteClientEmail: vi.fn(),
}));
const client = { id: 'client-1', clientSheetId: 'C1', name: 'Client', emails: [] };
describe('client management state', () => {
  beforeEach(() => vi.resetAllMocks());
  it('loads stored clients and selects the first one', async () => {
    vi.mocked(clientApi.listClients).mockResolvedValue([client]);
    const state = useClients();
    const pending = state.load();
    expect(state.loading.value).toBe(true);
    await pending;
    expect(state.selected.value).toEqual(client);
    expect(state.loading.value).toBe(false);
  });
  it('registers and renames a client without editing Sheets', async () => {
    const state = useClients();
    vi.mocked(clientApi.createClient).mockResolvedValue(client);
    vi.mocked(clientApi.updateClient).mockResolvedValue({ ...client, name: 'Renamed' });
    expect(await state.register(' Client ')).toBe(true);
    expect(state.selected.value?.id).toBe(client.id);
    expect(await state.rename(client.id, 'Renamed')).toBe(true);
    expect(state.selected.value?.name).toBe('Renamed');
    expect(clientApi.createClient).toHaveBeenCalledWith({ name: 'Client' });
    expect(clientApi.updateClient).toHaveBeenCalledWith(client.id, { name: 'Renamed' });
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
  it.each([' ', 'x'.repeat(201)])(
    'rejects invalid client names without a request',
    async (name) => {
      const state = useClients();
      expect(await state.register(name)).toBe(false);
      expect(state.formError.value).toContain('nombre de cliente');
      expect(clientApi.createClient).not.toHaveBeenCalled();
    },
  );
  it('retains the client list when creation fails and surfaces the error', async () => {
    const state = useClients();
    state.clients.value = [client];
    vi.mocked(clientApi.createClient).mockRejectedValue(new Error('database unavailable'));
    expect(await state.register('New client')).toBe(false);
    expect(state.clients.value).toEqual([client]);
    expect(state.formError.value).toBe('database unavailable');
    expect(state.saving.value).toBe(false);
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
    const first = state.register(' Client ');
    expect(state.saving.value).toBe(true);
    expect(await state.register(' Client ')).toBe(false);
    expect(clientApi.createClient).toHaveBeenCalledOnce();
    finish(client);
    expect(await first).toBe(true);
    expect(state.saving.value).toBe(false);
  });
});
