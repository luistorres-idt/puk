import { onScopeDispose, ref, watch } from 'vue';
import { getEvidenceUrl, releasePrivateFileUrl } from '../api.js';

interface GalleryEvidence {
  id: string;
  status: string;
}

interface EvidenceGalleryOptions {
  orderId: () => string;
  unitId: () => string;
  evidences: () => GalleryEvidence[];
}

export function useEvidenceGallery({ orderId, unitId, evidences }: EvidenceGalleryOptions) {
  const previewUrls = ref<Record<string, string>>({});
  const loadingUrls = ref<Record<string, boolean>>({});
  const requests = new Map<string, symbol>();
  const removedIds = new Set<string>();
  let currentScope = '';
  let disposed = false;

  function retire(evidenceId: string) {
    requests.delete(evidenceId);
    delete loadingUrls.value[evidenceId];
    const previewUrl = previewUrls.value[evidenceId];
    if (previewUrl) releasePrivateFileUrl(previewUrl);
    delete previewUrls.value[evidenceId];
  }

  async function load(evidenceId: string) {
    if (previewUrls.value[evidenceId] || requests.has(evidenceId)) return;
    const request = Symbol(evidenceId);
    requests.set(evidenceId, request);
    loadingUrls.value[evidenceId] = true;
    try {
      const { downloadUrl } = await getEvidenceUrl(evidenceId);
      if (disposed || requests.get(evidenceId) !== request) {
        releasePrivateFileUrl(downloadUrl);
        return;
      }
      previewUrls.value[evidenceId] = downloadUrl;
    } catch {
      // Ignore preview loading errors.
    } finally {
      if (requests.get(evidenceId) === request) {
        requests.delete(evidenceId);
        loadingUrls.value[evidenceId] = false;
      }
    }
  }

  function sync() {
    const scope = `${orderId()}\0${unitId()}`;
    if (scope !== currentScope) {
      for (const id of new Set([...Object.keys(previewUrls.value), ...requests.keys()])) retire(id);
      removedIds.clear();
      currentScope = scope;
    }

    const currentIds = new Set(evidences().map((evidence) => evidence.id));
    for (const id of removedIds) {
      if (!currentIds.has(id)) removedIds.delete(id);
    }
    const eligibleIds = new Set(
      evidences()
        .filter((evidence) => evidence.status === 'COMPLETED' && !removedIds.has(evidence.id))
        .map((evidence) => evidence.id),
    );
    for (const id of new Set([...Object.keys(previewUrls.value), ...requests.keys()])) {
      if (!eligibleIds.has(id)) retire(id);
    }
    for (const id of eligibleIds) void load(id);
  }

  function remove(evidenceId: string) {
    removedIds.add(evidenceId);
    retire(evidenceId);
  }

  watch(() => [orderId(), unitId(), evidences()], sync, { immediate: true, deep: true });
  onScopeDispose(() => {
    disposed = true;
    for (const id of new Set([...Object.keys(previewUrls.value), ...requests.keys()])) retire(id);
  });

  return { previewUrls, loadingUrls, remove };
}
