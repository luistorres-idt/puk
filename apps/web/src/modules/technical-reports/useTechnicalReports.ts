import { computed, ref } from 'vue';
import type { TechnicalReportOrder, TechnicalReportResponse } from '@puk/contracts';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import * as technicalReportsApi from './api.js';

export function useTechnicalReports() {
  const report = ref<TechnicalReportResponse | null>(null);
  const weekOffset = ref(0);
  const search = ref('');
  const loading = ref(false);
  const savingDhl = ref(false);
  const exporting = ref(false);
  const error = ref<string | null>(null);
  const actionError = ref<string | null>(null);

  const allOrders = computed<TechnicalReportOrder[]>(() =>
    (report.value?.groups ?? []).flatMap((group) => group.orders),
  );

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      report.value = await technicalReportsApi.fetchTechnicalReport({
        weekOffset: weekOffset.value,
        ...(search.value.trim() ? { search: search.value.trim() } : {}),
      });
    } catch (err) {
      error.value = extractApiErrorMessage(err, 'No se pudo cargar el reporte técnico.');
    } finally {
      loading.value = false;
    }
  }

  async function changeWeek(delta: number): Promise<void> {
    weekOffset.value = Math.max(-104, Math.min(12, weekOffset.value + delta));
    await load();
  }

  async function resetToCurrentWeek(): Promise<void> {
    weekOffset.value = 0;
    await load();
  }

  async function saveDhlShipping(
    orderId: string,
    dhlShippingCost: number | null,
  ): Promise<TechnicalReportOrder | null> {
    if (savingDhl.value) return null;
    savingDhl.value = true;
    actionError.value = null;
    try {
      const updated = await technicalReportsApi.updateOrderDhlShipping(orderId, {
        dhlShippingCost,
      });
      await load();
      return updated;
    } catch (err) {
      actionError.value = extractApiErrorMessage(err, 'No se pudo guardar el costo de envío DHL.');
      return null;
    } finally {
      savingDhl.value = false;
    }
  }

  async function exportExcel(technicianId?: string): Promise<boolean> {
    if (exporting.value) return false;
    exporting.value = true;
    actionError.value = null;
    try {
      const { blob, fileName } = await technicalReportsApi.downloadTechnicalReportExcel({
        weekOffset: weekOffset.value,
        ...(technicianId ? { technicianId } : {}),
      });
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
      return true;
    } catch (err) {
      actionError.value = extractApiErrorMessage(err, 'No se pudo descargar el Excel.');
      return false;
    } finally {
      exporting.value = false;
    }
  }

  return {
    report,
    allOrders,
    weekOffset,
    search,
    loading,
    savingDhl,
    exporting,
    error,
    actionError,
    load,
    changeWeek,
    resetToCurrentWeek,
    saveDhlShipping,
    exportExcel,
  };
}
