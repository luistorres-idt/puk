import { describe, expect, it, vi, beforeEach } from 'vitest';
import { canDeleteOrder, useDeleteOrder } from './useDeleteOrder.js';
import * as api from '../api.js';

vi.mock('../api.js', () => ({
  cancelOrder: vi.fn(),
}));

describe('canDeleteOrder', () => {
  it('returns true only for ADMIN and non-terminal statuses', () => {
    expect(canDeleteOrder('DRAFT', 'ADMIN')).toBe(true);
    expect(canDeleteOrder('ASSIGNED', 'ADMIN')).toBe(true);
    expect(canDeleteOrder('IN_PROGRESS', 'ADMIN')).toBe(true);
    expect(canDeleteOrder('REQUIRES_CORRECTION', 'ADMIN')).toBe(true);
    expect(canDeleteOrder('FAILED_APPOINTMENT', 'ADMIN')).toBe(true);

    // Completed orders cannot be deleted
    expect(canDeleteOrder('COMPLETED', 'ADMIN')).toBe(false);
    // Cancelled orders cannot be deleted again
    expect(canDeleteOrder('CANCELLED', 'ADMIN')).toBe(false);

    // Non-admin roles cannot delete
    expect(canDeleteOrder('DRAFT', 'TECHNICIAN')).toBe(false);
    expect(canDeleteOrder('ASSIGNED', undefined)).toBe(false);
  });
});

describe('useDeleteOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('manages modal state when opening and closing', () => {
    const hook = useDeleteOrder();
    expect(hook.showModal.value).toBe(false);
    expect(hook.targetOrder.value).toBeNull();

    hook.open({ id: 'order-1', folio: 'OS-001', status: 'DRAFT' });
    expect(hook.showModal.value).toBe(true);
    expect(hook.targetOrder.value).toEqual({ id: 'order-1', folio: 'OS-001', status: 'DRAFT' });

    hook.close();
    expect(hook.showModal.value).toBe(false);
    expect(hook.targetOrder.value).toBeNull();
  });

  it('successfully cancels order, notifies and triggers onSuccess callback', async () => {
    const notifySuccess = vi.fn();
    const onSuccess = vi.fn();
    const mockCancelOrder = vi
      .mocked(api.cancelOrder)
      .mockResolvedValue({} as unknown as api.OrderDetail);

    const hook = useDeleteOrder({ notifySuccess, onSuccess });
    hook.open({ id: 'order-123', folio: 'OS-123', status: 'ASSIGNED' });
    hook.deleteReason.value = '   Error al crear la orden   ';

    await hook.confirm();

    expect(mockCancelOrder).toHaveBeenCalledWith('order-123', 'Error al crear la orden');
    expect(notifySuccess).toHaveBeenCalledWith('Orden OS-123 eliminada y equipos liberados.');
    expect(onSuccess).toHaveBeenCalled();
    expect(hook.showModal.value).toBe(false);
    expect(hook.targetOrder.value).toBeNull();
  });

  it('handles cancellation error and notifies error callback', async () => {
    const notifyError = vi.fn();
    vi.mocked(api.cancelOrder).mockRejectedValue(new Error('Network error'));

    const hook = useDeleteOrder({ notifyError });
    hook.open({ id: 'order-err', folio: 'OS-ERR', status: 'DRAFT' });

    await hook.confirm();

    expect(notifyError).toHaveBeenCalledWith('Network error');
    expect(hook.isDeleting.value).toBe(false);
  });
});
