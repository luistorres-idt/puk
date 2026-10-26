import { ref } from 'vue';
import type { OrderStatus } from '@puk/contracts';
import { cancelOrder } from '../api.js';
import { extractApiErrorMessage } from '@/shared/http/client.js';

export interface TargetOrder {
  id: string;
  folio: string;
  status: OrderStatus;
}

export interface UseDeleteOrderOptions {
  onSuccess?: () => unknown;
  notifySuccess?: (message: string) => void;
  notifyError?: (message: string) => void;
}

export function canDeleteOrder(status: OrderStatus, role?: string): boolean {
  return role === 'ADMIN' && status !== 'COMPLETED' && status !== 'CANCELLED';
}

export function useDeleteOrder(options: UseDeleteOrderOptions = {}) {
  const showModal = ref(false);
  const targetOrder = ref<TargetOrder | null>(null);
  const deleteReason = ref('');
  const isDeleting = ref(false);

  function open(order: TargetOrder) {
    targetOrder.value = order;
    deleteReason.value = '';
    showModal.value = true;
  }

  function close() {
    if (isDeleting.value) return;
    showModal.value = false;
    targetOrder.value = null;
    deleteReason.value = '';
  }

  async function confirm(): Promise<boolean> {
    if (!targetOrder.value) return false;
    isDeleting.value = true;
    try {
      await cancelOrder(targetOrder.value.id, deleteReason.value.trim() || undefined);
      options.notifySuccess?.(`Orden ${targetOrder.value.folio} eliminada y equipos liberados.`);
      showModal.value = false;
      targetOrder.value = null;
      deleteReason.value = '';
      if (options.onSuccess) {
        await options.onSuccess();
      }
      return true;
    } catch (err) {
      options.notifyError?.(extractApiErrorMessage(err, 'Error al eliminar la orden'));
      return false;
    } finally {
      isDeleting.value = false;
    }
  }

  return {
    showModal,
    targetOrder,
    deleteReason,
    isDeleting,
    canDeleteOrder,
    open,
    close,
    confirm,
  };
}
