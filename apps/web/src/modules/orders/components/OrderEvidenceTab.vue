<script setup lang="ts">
import { NButton, NCard, NEmpty, NImage, NSpin, NTag } from 'naive-ui';
import { MIN_REQUIRED_EVIDENCE_PHOTOS } from '@puk/contracts';
import type { OrderDetail } from '../api.js';
import { getUnitAllEvidences } from '../composables/useOrderMedia.js';
import { CATEGORY_NAMES } from '../formatters.js';

defineProps<{
  order: OrderDetail;
  signatureUrl: string | null;
  evidenceUrls: Record<string, string>;
  loadingEvidenceUrls: Record<string, boolean>;
}>();

const emit = defineEmits<{
  (event: 'view-signature'): void;
  (event: 'view-evidence', evidenceId: string, categoryTitle: string): void;
}>();
</script>

<template>
  <div class="space-y-6">
    <!-- Signature Section -->
    <n-card class="shadow-sm" title="Firma de Conformidad" size="small">
      <div
        v-if="order.signature"
        class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div class="space-y-1">
          <p class="text-sm font-semibold text-slate-800">
            Firmado por:
            {{ order.signature.signerName }}
          </p>
          <p class="text-xs text-slate-500">
            Fecha de firma:
            {{ new Date(order.signature.signedAt).toLocaleString() }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <div
            v-if="signatureUrl"
            class="w-32 h-14 bg-slate-50 rounded border border-slate-200 p-1 flex items-center justify-center"
          >
            <n-image
              :src="signatureUrl"
              alt="Firma Digital"
              class="max-h-full max-w-full object-contain"
              :img-props="{ class: 'max-h-12 max-w-full object-contain' }"
            />
          </div>
          <n-button size="small" type="primary" secondary @click="emit('view-signature')">
            Ver Firma Digital
          </n-button>
        </div>
      </div>
      <n-empty v-else description="No se ha registrado firma en esta orden." />
    </n-card>

    <!-- Units & Evidence Section -->
    <div class="space-y-4">
      <h3 class="text-base font-bold text-slate-800">Checklist y Evidencias por Unidad</h3>

      <div v-for="unit in order.units ?? []" :key="unit.id" class="space-y-2">
        <n-card class="shadow-sm" size="small">
          <div class="space-y-4">
            <!-- Unit Header -->
            <div
              class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3"
            >
              <div>
                <h4 class="font-bold text-slate-800 text-sm">
                  Unidad: {{ unit.label }}
                  <span class="font-normal text-slate-500">({{ unit.makeModel }})</span>
                </h4>
                <p v-if="unit.serialNumber" class="text-xs text-slate-400 mt-0.5">
                  N° Serie / VIN: {{ unit.serialNumber }}
                </p>
              </div>

              <div class="flex items-center gap-2">
                <n-tag
                  size="small"
                  :type="
                    getUnitAllEvidences(unit).length >= MIN_REQUIRED_EVIDENCE_PHOTOS
                      ? 'success'
                      : 'warning'
                  "
                  round
                >
                  {{ getUnitAllEvidences(unit).length }} fotos registradas
                </n-tag>
              </div>
            </div>

            <!-- 1. Checklist Table / Grid -->
            <div>
              <h5
                class="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5"
              >
                <span>Checklist de Recepción del Vehículo</span>
              </h5>

              <div
                v-if="!unit.checklist?.items || unit.checklist.items.length === 0"
                class="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-slate-200"
              >
                Checklist no iniciado o sin elementos.
              </div>

              <div
                v-else
                class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5"
              >
                <div
                  v-for="item in unit.checklist.items"
                  :key="item.id"
                  class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5 flex flex-col justify-between"
                >
                  <div>
                    <div class="flex items-start justify-between gap-1 mb-1">
                      <span class="font-semibold text-slate-800 leading-tight">
                        {{ CATEGORY_NAMES[item.category] || item.category }}
                      </span>
                      <n-tag
                        size="tiny"
                        :type="
                          item.condition === 'GOOD'
                            ? 'success'
                            : item.condition === 'BAD'
                              ? 'error'
                              : 'default'
                        "
                      >
                        {{
                          item.condition === 'GOOD'
                            ? 'Bien'
                            : item.condition === 'BAD'
                              ? 'Mal'
                              : 'No aplica'
                        }}
                      </n-tag>
                    </div>

                    <div
                      v-if="item.notes"
                      class="text-red-700 bg-red-50 p-1.5 rounded border border-red-100 text-[11px] leading-snug"
                    >
                      <span class="font-bold">Nota:</span> {{ item.notes }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. Unit Evidence Gallery below Checklist -->
            <div class="pt-3 border-t border-slate-100">
              <div class="flex items-center justify-between mb-2.5">
                <h5
                  class="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5"
                >
                  <span>Galería de Evidencias Fotográficas</span>
                  <span class="text-slate-400 font-normal"
                    >({{ getUnitAllEvidences(unit).length }})</span
                  >
                </h5>
              </div>

              <div
                v-if="getUnitAllEvidences(unit).length === 0"
                class="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-lg border border-dashed border-slate-200 text-center"
              >
                No se adjuntaron fotografías para esta unidad.
              </div>

              <div
                v-else
                class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
              >
                <div
                  v-for="(ev, idx) in getUnitAllEvidences(unit)"
                  :key="ev.id"
                  class="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs hover:shadow-md transition-shadow group flex flex-col"
                >
                  <div
                    class="w-full h-28 flex items-center justify-center bg-slate-900/5 relative overflow-hidden"
                  >
                    <template v-if="evidenceUrls[ev.id]">
                      <n-image
                        :src="evidenceUrls[ev.id]!"
                        :alt="`Evidencia #${idx + 1}`"
                        object-fit="cover"
                        class="w-full h-full flex items-center justify-center cursor-pointer"
                        :img-props="{ class: 'w-full h-28 object-cover rounded' }"
                      />
                    </template>
                    <template v-else-if="loadingEvidenceUrls[ev.id]">
                      <div class="flex flex-col items-center gap-1 text-slate-400">
                        <n-spin size="small" />
                        <span class="text-[10px]">Cargando...</span>
                      </div>
                    </template>
                    <template v-else>
                      <n-button
                        size="tiny"
                        secondary
                        @click="
                          emit('view-evidence', ev.id, `${unit.label} - Foto #${Number(idx) + 1}`)
                        "
                      >
                        Ver foto {{ Number(idx) + 1 }}
                      </n-button>
                    </template>

                    <!-- Badge index -->
                    <div
                      class="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none"
                    >
                      #{{ Number(idx) + 1 }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </n-card>
      </div>
    </div>
  </div>
</template>
