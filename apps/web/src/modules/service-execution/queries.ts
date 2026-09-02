import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { unref, type MaybeRef } from 'vue';
import type {
  ChecklistCategory,
  CompleteEvidence,
  FailAppointment,
  PresignEvidence,
  ReportDiscrepancy,
  RequireCorrection,
  SaveChecklistItem,
} from '@puk/contracts';
import {
  checkCompleteness,
  completeEvidence,
  completeOrder,
  deleteEvidence,
  failAppointment,
  getSignatureUrl,
  presignEvidence,
  reportDiscrepancy,
  requireCorrection,
  saveChecklist,
  startOrder,
  verifyEquipment,
} from './api.js';

export function useCompletenessQuery(orderId: MaybeRef<string>) {
  return useQuery({
    queryKey: ['order-completeness', orderId],
    queryFn: () => checkCompleteness(unref(orderId)),
    enabled: () => Boolean(unref(orderId)),
  });
}

export function useSignatureUrlQuery(orderId: MaybeRef<string>) {
  return useQuery({
    queryKey: ['order-signature-url', orderId],
    queryFn: () => getSignatureUrl(unref(orderId)),
    enabled: () => Boolean(unref(orderId)),
  });
}

export function useExecutionMutations(orderId?: MaybeRef<string>) {
  const queryClient = useQueryClient();

  const invalidate = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    const targetId = id || (orderId ? unref(orderId) : undefined);
    if (targetId) {
      queryClient.invalidateQueries({ queryKey: ['order', targetId] });
      queryClient.invalidateQueries({ queryKey: ['order-completeness', targetId] });
      queryClient.invalidateQueries({ queryKey: ['order-signature-url', targetId] });
      queryClient.invalidateQueries({ queryKey: ['order-audit', targetId] });
    }
  };

  const start = useMutation({
    mutationFn: (id: string) => startOrder(id),
    onSuccess: (_, id) => invalidate(id),
  });

  const verify = useMutation({
    mutationFn: ({
      id,
      unitId,
      equipmentId,
    }: {
      id: string;
      unitId: string;
      equipmentId: string;
    }) => verifyEquipment(id, unitId, equipmentId),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const discrepancy = useMutation({
    mutationFn: ({
      id,
      unitId,
      equipmentId,
      data,
    }: {
      id: string;
      unitId: string;
      equipmentId: string;
      data: ReportDiscrepancy;
    }) => reportDiscrepancy(id, unitId, equipmentId, data),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const checklist = useMutation({
    mutationFn: ({
      id,
      unitId,
      items,
    }: {
      id: string;
      unitId: string;
      items: SaveChecklistItem[];
    }) => saveChecklist(id, unitId, items),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const uploadEvidence = useMutation({
    mutationFn: ({
      id,
      unitId,
      category,
      data,
    }: {
      id: string;
      unitId: string;
      category: ChecklistCategory;
      data: PresignEvidence;
    }) => presignEvidence(id, unitId, category, data),
  });

  const confirmEvidence = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CompleteEvidence }) =>
      completeEvidence(id, data),
    onSuccess: () => invalidate(),
  });

  const removeEvidence = useMutation({
    mutationFn: (evidenceId: string) => deleteEvidence(evidenceId),
    onSuccess: () => invalidate(),
  });

  const complete = useMutation({
    mutationFn: (id: string) => completeOrder(id),
    onSuccess: (_, id) => invalidate(id),
  });

  const fail = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FailAppointment }) => failAppointment(id, data),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  const correction = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RequireCorrection }) =>
      requireCorrection(id, data),
    onSuccess: (_, vars) => invalidate(vars.id),
  });

  return {
    checklist,
    complete,
    confirmEvidence,
    correction,
    discrepancy,
    fail,
    removeEvidence,
    start,
    uploadEvidence,
    verify,
  };
}
