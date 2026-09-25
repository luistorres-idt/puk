import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../api.js';
import { useOrderMedia } from './useOrderMedia.js';

const mediaApi = vi.hoisted(() => ({
  getEvidenceUrl: vi.fn(),
  getSignatureUrl: vi.fn(),
  releasePrivateFileUrl: vi.fn(),
}));

vi.mock('@/modules/service-execution', () => mediaApi);

function orderWithMedia() {
  return {
    signature: { id: 'signature-1', signerName: 'Receiver', signedAt: '2026-09-25T00:00:00Z' },
    units: [
      {
        evidence: [
          { id: 'completed-1', status: 'COMPLETED' },
          { id: 'pending-1', status: 'PENDING' },
        ],
      },
    ],
  } as OrderDetail;
}

function createMedia(initialTab = 'units', initialOrder?: OrderDetail) {
  const scope = effectScope();
  const activeTab = ref(initialTab);
  const order = ref(initialOrder);
  const notifyError = vi.fn();
  const media = scope.run(() =>
    useOrderMedia({ orderId: 'order-1', order, activeTab, notifyError }),
  )!;
  return { scope, activeTab, order, notifyError, media };
}

beforeEach(() => {
  mediaApi.getEvidenceUrl.mockImplementation(async (id: string) => ({ downloadUrl: `blob:${id}` }));
  mediaApi.getSignatureUrl.mockResolvedValue({
    downloadUrl: 'blob:signature-1',
    signerName: 'Receiver',
  });
});

afterEach(() => vi.clearAllMocks());

describe('useOrderMedia', () => {
  it('preloads only completed evidence and the signature when the evidence tab opens', async () => {
    const { scope, activeTab, media } = createMedia('units', orderWithMedia());
    expect(mediaApi.getEvidenceUrl).not.toHaveBeenCalled();
    expect(mediaApi.getSignatureUrl).not.toHaveBeenCalled();

    activeTab.value = 'evidence';
    await nextTick();
    await nextTick();

    expect(mediaApi.getSignatureUrl).toHaveBeenCalledWith('order-1');
    expect(mediaApi.getEvidenceUrl).toHaveBeenCalledExactlyOnceWith('completed-1');
    expect(media.evidenceUrls.value).toEqual({ 'completed-1': 'blob:completed-1' });
    expect(media.signatureUrl.value).toBe('blob:signature-1');

    activeTab.value = 'units';
    await nextTick();
    activeTab.value = 'evidence';
    await nextTick();
    expect(mediaApi.getEvidenceUrl).toHaveBeenCalledTimes(1);
    expect(mediaApi.getSignatureUrl).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('ignores preload failures so a later tab visit can retry', async () => {
    mediaApi.getEvidenceUrl.mockRejectedValueOnce(new Error('offline'));
    mediaApi.getSignatureUrl.mockRejectedValueOnce(new Error('offline'));
    const { scope, activeTab, media, notifyError } = createMedia('evidence', orderWithMedia());
    await nextTick();
    await nextTick();

    expect(media.evidenceUrls.value).toEqual({});
    expect(media.signatureUrl.value).toBeNull();
    expect(media.loadingEvidenceUrls.value['completed-1']).toBe(false);
    expect(media.loadingSignature.value).toBe(false);
    expect(notifyError).not.toHaveBeenCalled();

    activeTab.value = 'units';
    await nextTick();
    activeTab.value = 'evidence';
    await nextTick();
    await nextTick();
    expect(mediaApi.getEvidenceUrl).toHaveBeenCalledTimes(2);
    expect(mediaApi.getSignatureUrl).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it('releases the previous preview before opening a new one and reports preview errors', async () => {
    const { scope, media, notifyError } = createMedia();
    await media.viewEvidence('completed-1', 'Unit 1 - Photo #1');
    expect(media.previewImageUrl.value).toBe('blob:completed-1');
    expect(media.previewImageTitle.value).toBe('Evidencia: Unit 1 - Photo #1');
    expect(media.showImageModal.value).toBe(true);

    await media.viewSignature();
    expect(mediaApi.releasePrivateFileUrl).toHaveBeenCalledWith('blob:completed-1');
    expect(media.previewImageUrl.value).toBe('blob:signature-1');
    expect(media.previewImageTitle.value).toBe('Firma de Receiver');

    const error = new Error('offline');
    mediaApi.getEvidenceUrl.mockRejectedValueOnce(error);
    await media.viewEvidence('missing', 'Missing');
    expect(notifyError).toHaveBeenCalledWith(
      error,
      'No fue posible obtener la imagen de evidencia',
    );
    expect(media.previewImageUrl.value).toBe('blob:signature-1');
    scope.stop();
    expect(mediaApi.releasePrivateFileUrl).toHaveBeenCalledWith('blob:signature-1');
  });
});
