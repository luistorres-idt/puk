<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NSpin } from 'naive-ui';
import type { ChecklistCategory } from '@puk/contracts';
import {
  completeEvidence,
  deleteEvidence,
  presignEvidence,
  uploadToStorage,
} from '../api.js';

const props = defineProps<{
  orderId: string;
  unitId: string;
  category: ChecklistCategory;
  evidences?: Array<{ id: string; objectKey: string; status: string }>;
}>();

const emit = defineEmits<{
  (e: 'updated'): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

async function resizeImageIfNeeded(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
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

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  uploading.value = true;
  try {
    const { blob, width, height } = await resizeImageIfNeeded(file);

    // 1. Presign
    const presign = await presignEvidence(
      props.orderId,
      props.unitId,
      props.category,
      {
        mimeType: 'image/jpeg',
        sizeBytes: blob.size,
      },
    );

    // 2. Direct upload to S3/MinIO
    await uploadToStorage(presign.uploadUrl, blob, 'image/jpeg');

    // 3. Complete
    await completeEvidence(presign.evidenceId, {
      width,
      height,
    });

    emit('updated');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al subir fotografía';
    alert(message);
  } finally {
    uploading.value = false;
    if (fileInputRef.value) {
      fileInputRef.value.value = '';
    }
  }
}

async function handleDelete(evidenceId: string) {
  try {
    await deleteEvidence(evidenceId);
    emit('updated');
  } catch {
    alert('Error al eliminar evidencia');
  }
}
</script>

<template>
  <div class="space-y-2 mt-2">
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold text-slate-600">
        Evidencia Fotográfica (mínimo 1 requerida):
      </span>

      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        capture="environment"
        class="hidden"
        @change="handleFileChange"
      />

      <NButton
        size="tiny"
        type="primary"
        secondary
        :loading="uploading"
        @click="fileInputRef?.click()"
      >
        📷 Tomar / Subir Foto
      </NButton>
    </div>

    <NSpin :show="uploading">
      <div v-if="!evidences || evidences.length === 0" class="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
        ⚠ Sin fotografías. Se requiere al menos una imagen para cerrar la orden.
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <div
          v-for="ev in evidences"
          :key="ev.id"
          class="relative p-2 bg-slate-100 rounded border border-slate-300 text-xs flex items-center gap-2"
        >
          <span>📸 Foto adjunta</span>
          <button
            type="button"
            class="text-red-500 hover:text-red-700 font-bold ml-1"
            title="Eliminar"
            @click="handleDelete(ev.id)"
          >
            ✕
          </button>
        </div>
      </div>
    </NSpin>
  </div>
</template>
