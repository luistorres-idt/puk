import { computed, ref } from 'vue';
import { CreateClientSchema, SaveClientEmailSchema, type Client } from '@puk/contracts';
import { safeParse } from 'valibot';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import * as clientApi from './api.js';

export function useClients() {
  const clients = ref<Client[]>([]);
  const selectedId = ref<string | null>(null);
  const selected = computed(
    () => clients.value.find((client) => client.id === selectedId.value) ?? null,
  );
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const formError = ref<string | null>(null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      clients.value = await clientApi.listClients();
      if (!clients.value.some((client) => client.id === selectedId.value)) {
        selectedId.value = clients.value[0]?.id ?? null;
      }
    } catch (err) {
      error.value = extractApiErrorMessage(err, 'No se pudieron cargar los clientes.');
    } finally {
      loading.value = false;
    }
  }
  function storeClient(client: Client): void {
    const existing = clients.value.findIndex((item) => item.id === client.id);
    if (existing < 0) clients.value.push(client);
    else clients.value[existing] = client;
    selectedId.value = client.id;
  }
  async function save(work: () => Promise<void>): Promise<boolean> {
    if (saving.value) return false;
    saving.value = true;
    formError.value = null;
    try {
      await work();
      return true;
    } catch (err) {
      formError.value = extractApiErrorMessage(err, 'No se pudo guardar el cambio.');
      return false;
    } finally {
      saving.value = false;
    }
  }
  function register(name: string): Promise<boolean> {
    const parsed = safeParse(CreateClientSchema, { name });
    if (!parsed.success) {
      formError.value = 'Ingresa un nombre de cliente de entre 1 y 200 caracteres.';
      return Promise.resolve(false);
    }
    return save(async () => storeClient(await clientApi.createClient(parsed.output)));
  }
  function rename(id: string, name: string): Promise<boolean> {
    return save(async () => storeClient(await clientApi.updateClient(id, { name })));
  }
  function saveEmail(id: string, email: string, emailId?: string): Promise<boolean> {
    if (!safeParse(SaveClientEmailSchema, { email }).success) {
      formError.value = 'Ingresa un correo con formato válido.';
      return Promise.resolve(false);
    }
    return save(async () => {
      const saved = emailId
        ? await clientApi.updateClientEmail(id, emailId, { email })
        : await clientApi.addClientEmail(id, { email });
      const client = clients.value.find((item) => item.id === id);
      if (client) client.emails = [...client.emails.filter((item) => item.id !== saved.id), saved];
    });
  }
  function removeEmail(id: string, emailId: string): Promise<boolean> {
    return save(async () => {
      await clientApi.deleteClientEmail(id, emailId);
      const client = clients.value.find((item) => item.id === id);
      if (client) client.emails = client.emails.filter((item) => item.id !== emailId);
    });
  }
  return {
    clients,
    selectedId,
    selected,
    loading,
    saving,
    error,
    formError,
    load,
    register,
    rename,
    saveEmail,
    removeEmail,
  };
}
