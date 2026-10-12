import { ref, unref, type MaybeRef } from 'vue';
import { SaveClientEmailSchema, type Client, type ReportEmailResult } from '@puk/contracts';
import { safeParse } from 'valibot';
import { addClientEmail } from '@/modules/clients';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import { fetchReportEmailRecipients, sendReportEmail } from './report-email.api.js';

export function useReportEmail(orderId: MaybeRef<string>, reportId: MaybeRef<string>) {
  const client = ref<Client | null>(null);
  const configured = ref(false);
  const selectedIds = ref<string[]>([]);
  const loading = ref(false);
  const adding = ref(false);
  const sending = ref(false);
  const error = ref<string | null>(null);
  const result = ref<ReportEmailResult | null>(null);
  let loadGeneration = 0;

  async function load(): Promise<void> {
    const generation = ++loadGeneration;
    loading.value = true;
    client.value = null;
    configured.value = false;
    error.value = null;
    selectedIds.value = [];
    result.value = null;
    try {
      const context = await fetchReportEmailRecipients(unref(orderId));
      if (generation !== loadGeneration) return;
      client.value = context.client;
      configured.value = context.configured;
    } catch (err) {
      if (generation === loadGeneration)
        error.value = extractApiErrorMessage(err, 'No se pudieron cargar los destinatarios.');
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  }
  async function addEmail(email: string): Promise<boolean> {
    if (!client.value || adding.value || sending.value) return false;
    const parsed = safeParse(SaveClientEmailSchema, { email });
    if (!parsed.success) {
      error.value = 'Ingresa un correo con formato válido.';
      return false;
    }
    adding.value = true;
    error.value = null;
    try {
      const recipient = await addClientEmail(client.value.id, parsed.output);
      client.value.emails.push(recipient);
      selectedIds.value.push(recipient.id);
      return true;
    } catch (err) {
      error.value = extractApiErrorMessage(err, 'No se pudo agregar el correo.');
      return false;
    } finally {
      adding.value = false;
    }
  }
  async function send(): Promise<boolean> {
    if (sending.value || adding.value || loading.value) return false;
    if (
      !configured.value ||
      !client.value ||
      !selectedIds.value.length ||
      selectedIds.value.length > 20
    ) {
      error.value = 'Configura Gmail y selecciona entre uno y veinte destinatarios registrados.';
      return false;
    }
    sending.value = true;
    error.value = null;
    result.value = null;
    try {
      result.value = await sendReportEmail(unref(orderId), {
        reportId: unref(reportId),
        recipientIds: [...selectedIds.value],
      });
      const confirmed = new Set(
        result.value.results
          .filter((item) => item.status === 'SENT')
          .map((item) => item.recipientId),
      );
      selectedIds.value = selectedIds.value.filter((id) => !confirmed.has(id));
      return true;
    } catch (err) {
      error.value = `${extractApiErrorMessage(err, 'No se pudo confirmar el envío.')} Verifica la carpeta Enviados antes de reintentar.`;
      return false;
    } finally {
      sending.value = false;
    }
  }
  return {
    client,
    configured,
    selectedIds,
    loading,
    adding,
    sending,
    error,
    result,
    load,
    addEmail,
    send,
  };
}
