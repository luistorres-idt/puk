import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEvidenceGallery } from './useEvidenceGallery.js';

const mediaApi = vi.hoisted(() => ({
  getEvidenceUrl: vi.fn(),
  releasePrivateFileUrl: vi.fn(),
}));

vi.mock('../api.js', () => mediaApi);

type Evidence = { id: string; status: string };

function deferredUrl() {
  let resolve!: (value: { downloadUrl: string }) => void;
  const promise = new Promise<{ downloadUrl: string }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createGallery(initialEvidences: Evidence[] = []) {
  const scope = effectScope();
  const orderId = ref('order-1');
  const unitId = ref('unit-1');
  const evidences = ref(initialEvidences);
  const gallery = scope.run(() =>
    useEvidenceGallery({
      orderId: () => orderId.value,
      unitId: () => unitId.value,
      evidences: () => evidences.value,
    }),
  )!;
  return { scope, orderId, unitId, evidences, gallery };
}

beforeEach(() => {
  mediaApi.getEvidenceUrl.mockImplementation(async (id: string) => ({ downloadUrl: `blob:${id}` }));
});

afterEach(() => vi.clearAllMocks());

describe('useEvidenceGallery', () => {
  it('loads completed evidence once, ignores pending evidence, and releases retired previews', async () => {
    const { scope, evidences, gallery } = createGallery([
      { id: 'complete-1', status: 'COMPLETED' },
      { id: 'pending-1', status: 'PENDING' },
    ]);
    await nextTick();
    expect(mediaApi.getEvidenceUrl).toHaveBeenCalledExactlyOnceWith('complete-1');
    expect(gallery.previewUrls.value).toEqual({ 'complete-1': 'blob:complete-1' });

    evidences.value = [{ id: 'complete-1', status: 'COMPLETED' }];
    await nextTick();
    expect(mediaApi.getEvidenceUrl).toHaveBeenCalledTimes(1);

    evidences.value = [];
    await nextTick();
    expect(mediaApi.releasePrivateFileUrl).toHaveBeenCalledExactlyOnceWith('blob:complete-1');
    expect(gallery.previewUrls.value).toEqual({});
    scope.stop();
  });

  it('does not install a late URL for evidence removed while loading', async () => {
    const pending = deferredUrl();
    mediaApi.getEvidenceUrl.mockReturnValueOnce(pending.promise);
    const { scope, evidences, gallery } = createGallery([{ id: 'old', status: 'COMPLETED' }]);
    expect(gallery.loadingUrls.value.old).toBe(true);

    evidences.value = [];
    await nextTick();
    pending.resolve({ downloadUrl: 'blob:old' });
    await nextTick();

    expect(gallery.previewUrls.value).toEqual({});
    expect(gallery.loadingUrls.value.old).toBeUndefined();
    expect(mediaApi.releasePrivateFileUrl).toHaveBeenCalledExactlyOnceWith('blob:old');
    scope.stop();
  });

  it('releases the prior unit preview and rejects its late response on a scope change', async () => {
    const pending = deferredUrl();
    mediaApi.getEvidenceUrl.mockImplementationOnce(async () => ({ downloadUrl: 'blob:first' }));
    mediaApi.getEvidenceUrl.mockReturnValueOnce(pending.promise);
    const { scope, unitId, evidences, gallery } = createGallery([
      { id: 'first', status: 'COMPLETED' },
      { id: 'late', status: 'COMPLETED' },
    ]);
    await nextTick();

    unitId.value = 'unit-2';
    evidences.value = [{ id: 'second', status: 'COMPLETED' }];
    await nextTick();
    expect(mediaApi.releasePrivateFileUrl).toHaveBeenCalledWith('blob:first');
    expect(gallery.previewUrls.value).toEqual({ second: 'blob:second' });

    pending.resolve({ downloadUrl: 'blob:late' });
    await nextTick();
    expect(gallery.previewUrls.value).toEqual({ second: 'blob:second' });
    expect(mediaApi.releasePrivateFileUrl).toHaveBeenCalledWith('blob:late');
    scope.stop();
  });

  it('keeps a successfully deleted preview hidden until its stale parent row disappears', async () => {
    const { scope, evidences, gallery } = createGallery([{ id: 'deleted', status: 'COMPLETED' }]);
    await nextTick();
    gallery.remove('deleted');
    expect(gallery.previewUrls.value).toEqual({});
    expect(mediaApi.releasePrivateFileUrl).toHaveBeenCalledExactlyOnceWith('blob:deleted');

    evidences.value = [{ id: 'deleted', status: 'COMPLETED' }];
    await nextTick();
    expect(mediaApi.getEvidenceUrl).toHaveBeenCalledTimes(1);

    evidences.value = [];
    await nextTick();
    evidences.value = [{ id: 'deleted', status: 'COMPLETED' }];
    await nextTick();
    expect(mediaApi.getEvidenceUrl).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it('releases a late URL after disposal and leaves preload failures retryable', async () => {
    const pending = deferredUrl();
    mediaApi.getEvidenceUrl.mockReturnValueOnce(pending.promise);
    const { scope, gallery } = createGallery([{ id: 'late', status: 'COMPLETED' }]);
    scope.stop();
    pending.resolve({ downloadUrl: 'blob:late' });
    await nextTick();
    expect(mediaApi.releasePrivateFileUrl).toHaveBeenCalledExactlyOnceWith('blob:late');
    expect(gallery.previewUrls.value).toEqual({});

    mediaApi.getEvidenceUrl.mockRejectedValueOnce(new Error('offline'));
    const retry = createGallery([{ id: 'retry', status: 'COMPLETED' }]);
    await nextTick();
    expect(retry.gallery.loadingUrls.value.retry).toBe(false);
    retry.evidences.value = [{ id: 'retry', status: 'COMPLETED' }];
    await nextTick();
    expect(mediaApi.getEvidenceUrl).toHaveBeenCalledTimes(3);
    expect(retry.gallery.previewUrls.value).toEqual({ retry: 'blob:retry' });
    retry.scope.stop();
  });
});
