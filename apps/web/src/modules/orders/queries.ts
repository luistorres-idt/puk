import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { unref, type MaybeRef } from 'vue';
import type {
  AssignEquipment,
  CreateOrder,
  CreateUnit,
  OrderListQuery,
  RescheduleFailedAppointment,
  UpdateOrder,
  UpdateUnit,
} from '@puk/contracts';
import {
  addUnit,
  assignEquipment,
  assignOrder,
  cancelOrder,
  createOrder,
  deleteUnit,
  fetchOrderAudit,
  fetchOrderById,
  fetchCurrentReport,
  fetchOrders,
  fetchSyncStatus,
  generateReport,
  removeEquipment,
  retrySync,
  rescheduleFailedAppointment,
  updateOrder,
  updateUnit,
} from './api.js';

export function useOrdersQuery(params: MaybeRef<OrderListQuery>) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => fetchOrders(unref(params)),
  });
}

export function useOrderQuery(orderId: MaybeRef<string>) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => fetchOrderById(unref(orderId)),
    enabled: () => Boolean(unref(orderId)),
  });
}

export function useSyncStatusQuery(orderId: MaybeRef<string>) {
  return useQuery({
    queryKey: ['order-sync', orderId],
    queryFn: () => fetchSyncStatus(unref(orderId)),
    enabled: () => Boolean(unref(orderId)),
    refetchInterval: 10000,
  });
}

export function useOrderAuditQuery(orderId: MaybeRef<string>) {
  return useQuery({
    queryKey: ['order-audit', orderId],
    queryFn: () => fetchOrderAudit(unref(orderId)),
    enabled: () => Boolean(unref(orderId)),
  });
}

export function useOrderReportQuery(orderId: MaybeRef<string>) {
  return useQuery({
    queryKey: ['order-report', orderId],
    queryFn: () => fetchCurrentReport(unref(orderId)),
    enabled: () => Boolean(unref(orderId)),
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' || query.state.data?.status === 'PROCESSING'
        ? 3000
        : false,
    retry: false,
  });
}

export function useOrderMutations(orderId?: MaybeRef<string>) {
  const queryClient = useQueryClient();

  const invalidate = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    const targetId = id || (orderId ? unref(orderId) : undefined);
    if (targetId) {
      queryClient.invalidateQueries({ queryKey: ['order', targetId] });
      queryClient.invalidateQueries({ queryKey: ['order-sync', targetId] });
      queryClient.invalidateQueries({ queryKey: ['order-audit', targetId] });
    }
  };

  const create = useMutation({
    mutationFn: (data: CreateOrder) => createOrder(data),
    onSuccess: (newOrder) => invalidate(newOrder.id),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOrder }) => updateOrder(id, data),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const assign = useMutation({
    mutationFn: (id: string) => assignOrder(id),
    onSuccess: (_, id) => invalidate(id),
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | undefined }) =>
      cancelOrder(id, reason),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const reschedule = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RescheduleFailedAppointment }) =>
      rescheduleFailedAppointment(id, data),
    onSuccess: (newOrder, vars) => {
      invalidate(vars.id);
      invalidate(newOrder.id);
    },
  });

  const retry = useMutation({
    mutationFn: (id: string) => retrySync(id),
    onSuccess: (_, id) => invalidate(id),
  });

  const requestReport = useMutation({
    mutationFn: (id: string) => generateReport(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['order-report', id] });
      queryClient.invalidateQueries({ queryKey: ['order-audit', id] });
    },
  });

  const insertUnit = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateUnit }) => addUnit(id, data),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const modifyUnit = useMutation({
    mutationFn: ({ id, unitId, data }: { id: string; unitId: string; data: UpdateUnit }) =>
      updateUnit(id, unitId, data),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const removeUnit = useMutation({
    mutationFn: ({ id, unitId }: { id: string; unitId: string }) => deleteUnit(id, unitId),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const attachEquipment = useMutation({
    mutationFn: ({ id, unitId, data }: { id: string; unitId: string; data: AssignEquipment }) =>
      assignEquipment(id, unitId, data),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const detachEquipment = useMutation({
    mutationFn: ({
      id,
      unitId,
      equipmentId,
    }: {
      id: string;
      unitId: string;
      equipmentId: string;
    }) => removeEquipment(id, unitId, equipmentId),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  return {
    assign,
    attachEquipment,
    cancel,
    create,
    detachEquipment,
    insertUnit,
    modifyUnit,
    removeUnit,
    reschedule,
    retry,
    requestReport,
    update,
  };
}
