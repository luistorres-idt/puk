<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { NButton, NInput, NCard } from 'naive-ui';

const emit = defineEmits<{
  (e: 'save', payload: { signerName: string; blob: Blob }): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const signerName = ref('');
const isDrawing = ref(false);
const hasDrawn = ref(false);

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
  if (!canvasRef.value) return;
  const ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;
  isDrawing.value = true;
  hasDrawn.value = true;
  const { x, y } = getCoordinates(event);
  ctx.beginPath();
  ctx.moveTo(x, y);
}

function draw(event: MouseEvent | TouchEvent) {
  if (!isDrawing.value || !canvasRef.value) return;
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
  if (!canvasRef.value || !hasDrawn.value || !signerName.value.trim()) return;
  canvasRef.value.toBlob((blob) => {
    if (blob) {
      emit('save', { signerName: signerName.value.trim(), blob });
    }
  }, 'image/png');
}

onMounted(() => {
  if (canvasRef.value) {
    canvasRef.value.width = canvasRef.value.parentElement?.clientWidth || 400;
    canvasRef.value.height = 180;
  }
});
</script>

<template>
  <NCard title="Firma y Conformidad del Cliente" class="shadow-sm">
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">
          Nombre completo de quien recibe el servicio *
        </label>
        <NInput
          v-model:value="signerName"
          placeholder="Nombre y apellido del cliente o encargado"
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
        <NButton size="small" secondary @click="clearCanvas">
          Limpiar Firma
        </NButton>

        <NButton
          type="primary"
          size="small"
          :disabled="!hasDrawn || !signerName.trim()"
          @click="handleSave"
        >
          Guardar Firma
        </NButton>
      </div>
    </div>
  </NCard>
</template>
