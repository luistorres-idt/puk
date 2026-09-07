<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { NButton, NCard, NImage, NInput, NSpin } from 'naive-ui';
import { getSignatureUrl } from '../api.js';

const props = withDefaults(
  defineProps<{
    orderId?: string;
    existingSignature?:
      | {
          signerName: string;
          signedAt?: string;
        }
      | null
      | undefined;
    disabled?: boolean;
    saving?: boolean;
  }>(),
  {
    orderId: '',
    existingSignature: null,
    disabled: false,
    saving: false,
  },
);

const emit = defineEmits<{
  (e: 'save', payload: { signerName: string; blob: Blob }): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const signerName = ref('');
const isDrawing = ref(false);
const hasDrawn = ref(false);
const isEditing = ref(false);
const previewUrl = ref<string | null>(null);
const loadingPreview = ref(false);

async function loadSignaturePreview() {
  if (!props.orderId || !props.existingSignature) {
    previewUrl.value = null;
    return;
  }
  loadingPreview.value = true;
  try {
    const res = await getSignatureUrl(props.orderId);
    previewUrl.value = res.downloadUrl;
    if (!signerName.value) {
      signerName.value = res.signerName || props.existingSignature.signerName || '';
    }
  } catch {
    // Ignore preview loading errors
  } finally {
    loadingPreview.value = false;
  }
}

async function initCanvas() {
  await nextTick();
  if (canvasRef.value) {
    canvasRef.value.width = canvasRef.value.parentElement?.clientWidth || 400;
    canvasRef.value.height = 180;
    clearCanvas();
  }
}

function startReSigning() {
  isEditing.value = true;
  hasDrawn.value = false;
  signerName.value = props.existingSignature?.signerName || '';
  void initCanvas();
}

function cancelReSigning() {
  isEditing.value = false;
  hasDrawn.value = false;
  signerName.value = props.existingSignature?.signerName || '';
}

watch(
  () => props.existingSignature,
  (newSig) => {
    if (newSig) {
      isEditing.value = false;
      signerName.value = newSig.signerName || '';
      void loadSignaturePreview();
    } else {
      isEditing.value = true;
      previewUrl.value = null;
      void initCanvas();
    }
  },
  { immediate: true },
);

function getCoordinates(event: MouseEvent | TouchEvent) {
  if (!canvasRef.value) return { x: 0, y: 0 };
  const rect = canvasRef.value.getBoundingClientRect();
  const touch = 'touches' in event && event.touches.length > 0 ? event.touches[0] : null;
  const clientX = touch ? touch.clientX : (event as MouseEvent).clientX;
  const clientY = touch ? touch.clientY : (event as MouseEvent).clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function startDrawing(event: MouseEvent | TouchEvent) {
  if (!canvasRef.value || props.disabled || props.saving) return;
  const ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;
  isDrawing.value = true;
  hasDrawn.value = true;
  const { x, y } = getCoordinates(event);
  ctx.beginPath();
  ctx.moveTo(x, y);
}

function draw(event: MouseEvent | TouchEvent) {
  if (!isDrawing.value || !canvasRef.value || props.disabled || props.saving) return;
  const ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;
  const { x, y } = getCoordinates(event);
  ctx.lineTo(x, y);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function stopDrawing() {
  isDrawing.value = false;
}

function clearCanvas() {
  if (!canvasRef.value) return;
  const ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
  hasDrawn.value = false;
}

function handleSave() {
  if (!canvasRef.value || !hasDrawn.value || !signerName.value.trim() || props.saving) return;
  canvasRef.value.toBlob((blob) => {
    if (blob) {
      emit('save', { signerName: signerName.value.trim(), blob });
    }
  }, 'image/png');
}

onMounted(() => {
  if (isEditing.value) {
    void initCanvas();
  }
});
</script>

<template>
  <NCard title="Firma y Conformidad del Cliente" class="shadow-sm">
    <!-- State 1: Existing signature display -->
    <div v-if="existingSignature && !isEditing" class="space-y-4">
      <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg"
      >
        <div class="space-y-1">
          <div class="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
            <span>Firma de conformidad registrada exitosamente</span>
          </div>
          <p class="text-xs text-slate-700">
            <span class="font-semibold">Firmado por:</span> {{ existingSignature.signerName }}
          </p>
          <p v-if="existingSignature.signedAt" class="text-[11px] text-slate-500">
            <span class="font-semibold">Fecha:</span>
            {{ new Date(existingSignature.signedAt).toLocaleString() }}
          </p>
        </div>

        <div v-if="!disabled" class="shrink-0">
          <NButton size="small" secondary type="warning" @click="startReSigning">
            Cambiar Firma
          </NButton>
        </div>
      </div>

      <!-- Signature preview image -->
      <div
        class="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col items-center justify-center min-h-[160px]"
      >
        <template v-if="previewUrl">
          <NImage
            :src="previewUrl!"
            :alt="`Firma de ${existingSignature.signerName}`"
            class="max-h-40 max-w-full object-contain rounded bg-white p-2 border border-slate-200 shadow-2xs"
            :img-props="{ class: 'max-h-40 max-w-full object-contain bg-white' }"
          />
          <span class="text-[11px] text-slate-400 mt-2">Haz clic sobre la firma para ampliar</span>
        </template>
        <template v-else-if="loadingPreview">
          <div class="flex flex-col items-center gap-2 text-slate-500 py-6">
            <NSpin size="small" />
            <span class="text-xs">Cargando imagen de firma...</span>
          </div>
        </template>
        <template v-else>
          <div class="text-xs text-slate-400 italic py-6">
            Firma guardada (vista previa no disponible)
          </div>
        </template>
      </div>
    </div>

    <!-- State 2: Drawing canvas (new signature or re-signing) -->
    <div v-else class="space-y-4">
      <div
        v-if="existingSignature"
        class="flex items-center justify-between bg-amber-50 border border-amber-200 p-2.5 rounded-md text-xs text-amber-800"
      >
        <span>Actualizando firma previamente guardada.</span>
        <NButton size="tiny" quaternary @click="cancelReSigning">
          Cancelar y conservar firma actual
        </NButton>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">
          Nombre completo de quien recibe el servicio *
        </label>
        <NInput
          v-model:value="signerName"
          placeholder="Nombre y apellido del cliente o encargado"
          :disabled="disabled || saving"
        />
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">
          Firma digital en pantalla *
        </label>
        <div class="border border-slate-300 rounded bg-white overflow-hidden touch-none">
          <canvas
            ref="canvasRef"
            class="w-full cursor-crosshair block"
            @mousedown="startDrawing"
            @mousemove="draw"
            @mouseup="stopDrawing"
            @mouseleave="stopDrawing"
            @touchstart.prevent="startDrawing"
            @touchmove.prevent="draw"
            @touchend.prevent="stopDrawing"
          />
        </div>
      </div>

      <div class="flex justify-between items-center pt-2">
        <div class="flex items-center gap-2">
          <NButton size="small" secondary :disabled="saving" @click="clearCanvas">
            Limpiar Trazo
          </NButton>
          <NButton
            v-if="existingSignature"
            size="small"
            quaternary
            :disabled="saving"
            @click="cancelReSigning"
          >
            Cancelar
          </NButton>
        </div>

        <NButton
          type="primary"
          size="small"
          :disabled="!hasDrawn || !signerName.trim() || disabled"
          :loading="saving"
          @click="handleSave"
        >
          Guardar Firma
        </NButton>
      </div>
    </div>
  </NCard>
</template>
