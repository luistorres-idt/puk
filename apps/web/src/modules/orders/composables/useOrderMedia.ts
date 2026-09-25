import { onScopeDispose, ref, watch, type Ref } from 'vue';
import type { OrderDetail, UnitItem } from '../api.js';
import {
  getEvidenceUrl,
  getSignatureUrl,
  releasePrivateFileUrl,
} from '@/modules/service-execution';

interface OrderMediaState {
  orderId: string;
  order: Readonly<Ref<OrderDetail | undefined>>;
  activeTab: Readonly<Ref<string>>;
  notifyError: (error: unknown, fallback: string) => void;
}

export function getUnitAllEvidences(unit: UnitItem): Array<{ id: string; objectKey?: string }> {
  return (
    unit.evidence?.filter((evidence) => evidence.status === 'COMPLETED' || !evidence.status) ?? []
  );
}

export function useOrderMedia({ orderId, order, activeTab, notifyError }: OrderMediaState) {
  const showImageModal = ref(false);
  const previewImageUrl = ref<string | null>(null);
  const previewImageTitle = ref('');
  const evidenceUrls = ref<Record<string, string>>({});
  const loadingEvidenceUrls = ref<Record<string, boolean>>({});
  const signatureUrl = ref<string | null>(null);
  const loadingSignature = ref(false);

  async function viewEvidence(evidenceId: string, categoryTitle: string) {
    try {
      const res = await getEvidenceUrl(evidenceId);
      releasePrivateFileUrl(previewImageUrl.value);
      previewImageUrl.value = res.downloadUrl;
      previewImageTitle.value = `Evidencia: ${categoryTitle}`;
      showImageModal.value = true;
    } catch (err) {
      notifyError(err, 'No fue posible obtener la imagen de evidencia');
    }
  }

  async function viewSignature() {
    try {
      const res = await getSignatureUrl(orderId);
      releasePrivateFileUrl(previewImageUrl.value);
      previewImageUrl.value = res.downloadUrl;
      previewImageTitle.value = `Firma de ${res.signerName || 'Receptor'}`;
      showImageModal.value = true;
    } catch (err) {
      notifyError(err, 'No fue posible obtener la firma');
    }
  }

  async function loadEvidenceUrl(evidenceId: string) {
    if (evidenceUrls.value[evidenceId] || loadingEvidenceUrls.value[evidenceId]) return;
    loadingEvidenceUrls.value[evidenceId] = true;
    try {
      const res = await getEvidenceUrl(evidenceId);
      evidenceUrls.value[evidenceId] = res.downloadUrl;
    } catch {
      // Ignore preview loading errors.
    } finally {
      loadingEvidenceUrls.value[evidenceId] = false;
    }
  }

  async function loadSignatureUrl() {
    if (!orderId || signatureUrl.value || loadingSignature.value) return;
    loadingSignature.value = true;
    try {
      const res = await getSignatureUrl(orderId);
      signatureUrl.value = res.downloadUrl;
    } catch {
      // Ignore preview loading errors.
    } finally {
      loadingSignature.value = false;
    }
  }

  function preloadEvidencesAndSignature() {
    if (!order.value) return;
    if (order.value.signature) {
      void loadSignatureUrl();
    }
    const units = order.value.units || [];
    for (const unit of units) {
      const evs = getUnitAllEvidences(unit);
      for (const ev of evs) {
        void loadEvidenceUrl(ev.id);
      }
    }
  }

  watch(
    () => [activeTab.value, order.value],
    () => {
      if (activeTab.value === 'evidence') {
        preloadEvidencesAndSignature();
      }
    },
    { immediate: true, deep: true },
  );

  onScopeDispose(() => {
    releasePrivateFileUrl(previewImageUrl.value);
    releasePrivateFileUrl(signatureUrl.value);
    for (const url of Object.values(evidenceUrls.value)) releasePrivateFileUrl(url);
  });

  return {
    showImageModal,
    previewImageUrl,
    previewImageTitle,
    evidenceUrls,
    loadingEvidenceUrls,
    signatureUrl,
    loadingSignature,
    viewEvidence,
    viewSignature,
  };
}
