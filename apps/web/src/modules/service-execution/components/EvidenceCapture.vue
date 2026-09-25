<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { NButton, NImage, NPopconfirm, NSpin, useMessage } from 'naive-ui';
import { MIN_REQUIRED_EVIDENCE_PHOTOS } from '@puk/contracts';
import {
  completeEvidence,
  deleteEvidence,
  getEvidenceUrl,
  getStorageMode,
  presignEvidence,
  releasePrivateFileUrl,
  uploadEvidenceFile,
  uploadToStorage,
} from '../api.js';

const props = withDefaults(
  defineProps<{
    orderId: string;
    unitId: string;
    evidences?: Array<{ id: string; status: string }>;
    disabled?: boolean;
    minRequired?: number;
  }>(),
  {
    evidences: () => [],
    disabled: false,
    minRequired: MIN_REQUIRED_EVIDENCE_PHOTOS,
  },
);

const emit = defineEmits<{
  (e: 'updated'): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const cameraInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadingStatusText = ref('');
const deletingId = ref<string | null>(null);
const previewUrls = ref<Record<string, string>>({});
const loadingUrls = ref<Record<string, boolean>>({});
const message = useMessage();
const pendingUploadKeys = new Map<string, string>();

function evidenceRetryKey(file: File): string {
  return `puk:evidence-upload:${props.orderId}:${props.unitId}:${file.name}:${file.size}:${file.lastModified}`;
}

function idempotencyKeyFor(file: File): string {
  const retryKey = evidenceRetryKey(file);
  let savedKey: string | null = null;
  try {
    savedKey = sessionStorage.getItem(retryKey);
  } catch {
    // Private browsing may disable session storage; in-memory retry still works.
  }
  const key = pendingUploadKeys.get(retryKey) ?? savedKey ?? crypto.randomUUID();
  pendingUploadKeys.set(retryKey, key);
  try {
    sessionStorage.setItem(retryKey, key);
  } catch {
    // The server-side reservation remains authoritative.
  }
  return key;
}

function clearIdempotencyKey(file: File): void {
  const retryKey = evidenceRetryKey(file);
  pendingUploadKeys.delete(retryKey);
  try {
    sessionStorage.removeItem(retryKey);
  } catch {
    // No persistent browser state to clear.
  }
}

onUnmounted(() => {
  for (const url of Object.values(previewUrls.value)) releasePrivateFileUrl(url);
});

async function fetchEvidenceUrl(evidenceId: string) {
  if (previewUrls.value[evidenceId] || loadingUrls.value[evidenceId]) return;
  loadingUrls.value[evidenceId] = true;
  try {
    const res = await getEvidenceUrl(evidenceId);
    previewUrls.value[evidenceId] = res.downloadUrl;
  } catch {
    // Ignore preview loading errors
  } finally {
    loadingUrls.value[evidenceId] = false;
  }
}

function syncEvidenceUrls() {
  if (!props.evidences || props.evidences.length === 0) return;
  for (const ev of props.evidences) {
    if (ev.status === 'COMPLETED' && !previewUrls.value[ev.id]) {
      void fetchEvidenceUrl(ev.id);
    }
  }
}

watch(
  () => props.evidences,
  () => {
    syncEvidenceUrls();
  },
  { immediate: true, deep: true },
);

async function resizeImageIfNeeded(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen seleccionado'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen seleccionada'));
      img.onload = () => {
        const maxDimension = 1920;
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            resolve({ blob: blob || file, width, height });
          },
          'image/jpeg',
          0.85,
        );
      };
      img.src = String(e.target?.result);
    };
    reader.readAsDataURL(file);
  });
}

function isHeicFile(file: File): boolean {
  const normalizedType = file.type.toLowerCase();
  const normalizedName = file.name.toLowerCase();
  return (
    normalizedType === 'image/heic' ||
    normalizedType === 'image/heif' ||
    normalizedName.endsWith('.heic') ||
    normalizedName.endsWith('.heif')
  );
}

async function convertHeicIfNeeded(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  uploadingStatusText.value = 'Convirtiendo foto HEIC a JPEG...';
  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({
    blob: file,
    quality: 0.85,
    toType: 'image/jpeg',
  });
  const jpeg = Array.isArray(converted) ? converted[0] : converted;
  if (!(jpeg instanceof Blob)) {
    throw new Error('No fue posible convertir la foto HEIC a JPEG');
  }

  return new File([jpeg], `${file.name.replace(/\.(heic|heif)$/i, '')}.jpg`, {
    lastModified: file.lastModified,
    type: 'image/jpeg',
  });
}

async function handleFilesSelected(files: File[]) {
  if (!files || files.length === 0) return;

  uploading.value = true;
  let successCount = 0;
  let failCount = 0;
  let lastErrorMessage: string | undefined;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    uploadingStatusText.value = `Subiendo foto ${i + 1} de ${files.length}...`;
    try {
      const normalizedFile = await convertHeicIfNeeded(file);
      const { blob, width, height } = await resizeImageIfNeeded(normalizedFile);

      if ((await getStorageMode()) === 'drive') {
        await uploadEvidenceFile(
          props.orderId,
          props.unitId,
          blob,
          width,
          height,
          idempotencyKeyFor(file),
        );
        clearIdempotencyKey(file);
      } else {
        const presign = await presignEvidence(props.orderId, props.unitId, {
          mimeType: 'image/jpeg',
          sizeBytes: blob.size,
        });
        await uploadToStorage(presign.uploadUrl, blob, 'image/jpeg');
        await completeEvidence(presign.evidenceId, { width, height });
      }

      successCount++;
    } catch (error) {
      failCount++;
      if (error instanceof Error && error.message.trim().length > 0) {
        lastErrorMessage = error.message;
      }
    }
  }

  uploading.value = false;
  uploadingStatusText.value = '';

  if (fileInputRef.value) fileInputRef.value.value = '';
  if (cameraInputRef.value) cameraInputRef.value.value = '';

  if (successCount > 0) {
    message?.success(
      successCount === 1
        ? 'Fotografía agregada correctamente'
        : `${successCount} fotografías agregadas correctamente`,
    );
    emit('updated');
  }

  if (failCount > 0) {
    message?.error(
      lastErrorMessage === undefined
        ? `No fue posible subir ${failCount} fotografía(s)`
        : `No fue posible subir ${failCount} fotografía(s): ${lastErrorMessage}`,
    );
  }
}

function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files ? Array.from(target.files) : [];
  void handleFilesSelected(files);
}

async function handleDelete(evidenceId: string) {
  deletingId.value = evidenceId;
  try {
    await deleteEvidence(evidenceId);
    releasePrivateFileUrl(previewUrls.value[evidenceId]);
    delete previewUrls.value[evidenceId];
    message?.success('Fotografía eliminada');
    emit('updated');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al eliminar evidencia';
    if (message) {
      message.error(errorMsg);
    } else {
      alert(errorMsg);
    }
  } finally {
    deletingId.value = null;
  }
}
</script>

<template>
  <div class="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h4 class="text-sm font-bold text-slate-800">Evidencias Fotográficas del Vehículo</h4>
          <span
            v-if="evidences.length >= minRequired"
            class="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1"
          >
            {{ evidences.length }} fotos (mínimo {{ minRequired }} cumplido)
          </span>
          <span
            v-else
            class="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-flex items-center gap-1"
          >
            {{ evidences.length }} / {{ minRequired }} fotos
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">
          Tome o suba al menos {{ minRequired }} fotografías generales de la unidad (exteriores,
          tablero, kilometraje, etc.)
        </p>
      </div>

      <!-- Actions: Camera & Multi-file picker -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Hidden Inputs -->
        <input
          ref="fileInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          multiple
          class="hidden"
          :disabled="disabled || uploading"
          @change="onFileInputChange"
        />
        <input
          ref="cameraInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          capture="environment"
          class="hidden"
          :disabled="disabled || uploading"
          @change="onFileInputChange"
        />

        <NButton
          size="small"
          type="primary"
          secondary
          :disabled="disabled || uploading"
          @click="cameraInputRef?.click()"
        >
          Tomar Foto
        </NButton>

        <NButton
          size="small"
          type="primary"
          :disabled="disabled"
          :loading="uploading"
          @click="fileInputRef?.click()"
        >
          Subir Varias Fotos
        </NButton>
      </div>
    </div>

    <!-- Uploading progress banner -->
    <div
      v-if="uploading"
      class="bg-indigo-50 border border-indigo-200 p-2.5 rounded-lg flex items-center gap-2 text-xs text-indigo-700"
    >
      <NSpin size="small" />
      <span class="font-medium">{{
        uploadingStatusText || 'Procesando y subiendo fotografías...'
      }}</span>
    </div>

    <!-- Status warning when photos < minRequired -->
    <div
      v-if="evidences.length < minRequired"
      class="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
    >
      <div class="flex items-center gap-1.5">
        <span>
          {{
            evidences.length === 0
              ? `Sin fotografías. Se requieren al menos ${minRequired} imágenes de la unidad para cerrar la orden.`
              : `Faltan fotografías. Se requieren al menos ${minRequired} imágenes (actualmente ${evidences.length}/${minRequired}).`
          }}
        </span>
      </div>
      <NButton
        v-if="!disabled && !uploading"
        size="tiny"
        type="warning"
        ghost
        class="self-start sm:self-auto shrink-0"
        @click="fileInputRef?.click()"
      >
        Subir fotos faltantes
      </NButton>
    </div>

    <!-- Preview Gallery -->
    <div v-if="evidences.length > 0" class="pt-1">
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div
          v-for="(ev, idx) in evidences"
          :key="ev.id"
          class="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shadow-xs flex flex-col group transition-all hover:border-slate-300"
        >
          <!-- Image thumbnail -->
          <div
            class="w-full h-28 flex items-center justify-center bg-slate-900/5 relative overflow-hidden"
          >
            <template v-if="previewUrls[ev.id]">
              <NImage
                :src="previewUrls[ev.id]!"
                :alt="`Evidencia #${idx + 1}`"
                object-fit="cover"
                class="w-full h-full flex items-center justify-center"
                :img-props="{ class: 'w-full h-28 object-cover rounded' }"
              />
            </template>
            <template v-else-if="loadingUrls[ev.id]">
              <div class="flex flex-col items-center gap-1 text-slate-400">
                <NSpin size="small" />
                <span class="text-[10px]">Cargando...</span>
              </div>
            </template>
            <template v-else>
              <div class="flex flex-col items-center text-slate-400 text-xs">
                <span class="text-[11px] font-medium">Foto {{ idx + 1 }}</span>
              </div>
            </template>

            <!-- Delete button in top corner with confirmation -->
            <div v-if="!disabled" class="absolute top-1.5 right-1.5 z-10">
              <NPopconfirm
                positive-text="Eliminar"
                negative-text="Cancelar"
                @positive-click="handleDelete(ev.id)"
              >
                <template #trigger>
                  <button
                    type="button"
                    class="bg-red-600/90 hover:bg-red-700 text-white rounded px-1.5 py-0.5 text-[10px] font-medium shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                    :title="`Eliminar foto #${idx + 1}`"
                    :disabled="deletingId === ev.id"
                    @click.stop
                  >
                    <span v-if="deletingId === ev.id">Borrando...</span>
                    <span v-else>Quitar</span>
                  </button>
                </template>
                ¿Deseas eliminar esta fotografía?
              </NPopconfirm>
            </div>

            <!-- Photo index badge -->
            <div
              class="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none"
            >
              #{{ idx + 1 }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
