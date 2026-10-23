<script setup lang="ts">
import { toRefs } from 'vue';
import { NButton, NInput, NModal, useMessage } from 'naive-ui';
import type { OrderPricingOverrides } from '@puk/contracts';
import { ORDER_SERVICE_LABELS } from '@puk/contracts';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import type { OrderDetail } from '../api.js';
import {
  getTechnicianBaseRate,
  useOrderPricingModal,
} from '../composables/useOrderPricingModal.js';

const props = defineProps<{
  orderId: string;
  order: OrderDetail | undefined;
  updatePricing: (input: { id: string; overrides: OrderPricingOverrides }) => Promise<unknown>;
  updatePricingPending?: boolean;
}>();

const emit = defineEmits<{
  (e: 'saved'): void;
}>();

const message = useMessage();
const { order } = toRefs(props);

const {
  showPricingModal,
  isSubmitting,
  showAllServices,
  rates,
  travelExpenses,
  reason,
  isFinalized,
  displayedServices,
  openPricingModal,
  closePricingModal,
  handleSave,
} = useOrderPricingModal({
  orderId: props.orderId,
  order,
  updatePricing: props.updatePricing,
  notifySuccess: (msg) => message.success(msg),
  notifyError: (err, fallback) => message.error(extractApiErrorMessage(err, fallback)),
  onSaved: () => emit('saved'),
});

defineExpose({
  openPricingModal,
  closePricingModal,
});
</script>

<template>
  <n-modal
    v-model:show="showPricingModal"
    preset="card"
    :title="isFinalized ? 'Ajustar Precios de Liquidación' : 'Tarifas Acordadas de la Orden'"
    class="w-[92vw] max-w-lg"
  >
    <div class="space-y-4">
      <!-- Context Header Info -->
      <div
        class="text-xs text-slate-500 pb-2 border-b border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span><strong class="text-slate-700">Folio:</strong> {{ order?.folio ?? '-' }}</span>
        <span>·</span>
        <span>
          <strong class="text-slate-700">Técnico:</strong>
          {{ order?.technician?.name ?? 'Sin asignar' }}
        </span>
        <span>·</span>
        <span class="truncate max-w-[200px]">
          <strong class="text-slate-700">Cliente:</strong> {{ order?.clientNameSnapshot ?? '-' }}
        </span>
      </div>

      <p class="text-xs text-slate-500 leading-relaxed">
        {{
          isFinalized
            ? 'Modifica los precios unitarios o viáticos aplicados a esta orden. La liquidación se recalculará automáticamente.'
            : 'Establece tarifas personalizadas para esta orden. Si dejas un campo vacío, se utilizará la tarifa base del técnico.'
        }}
      </p>

      <!-- Clean Tabular Pricing Form -->
      <div class="border border-slate-200 rounded-lg overflow-x-auto">
        <table class="w-full text-xs text-left border-collapse">
          <thead class="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th class="py-2 px-2.5 sm:px-3 font-semibold">Servicio</th>
              <th class="py-2 px-2.5 sm:px-3 font-semibold text-right">Tarifa Base</th>
              <th class="py-2 px-2.5 sm:px-3 font-semibold text-right w-28 sm:w-44">
                Tarifa de la Orden
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="svc in displayedServices"
              :key="svc"
              class="hover:bg-slate-50/50 transition-colors"
            >
              <td class="py-2 px-2.5 sm:px-3">
                <span class="font-medium text-slate-800">{{ ORDER_SERVICE_LABELS[svc] }}</span>
              </td>
              <td class="py-2 px-2.5 sm:px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                {{
                  getTechnicianBaseRate(svc, order)
                    ? `$${Number(getTechnicianBaseRate(svc, order)).toFixed(2)}`
                    : '—'
                }}
              </td>
              <td class="py-1.5 px-2.5 sm:px-3 text-right">
                <n-input
                  v-model:value="rates[svc]"
                  type="text"
                  :input-props="{ inputmode: 'decimal' }"
                  :placeholder="
                    getTechnicianBaseRate(svc, order)
                      ? Number(getTechnicianBaseRate(svc, order)).toFixed(2)
                      : '0.00'
                  "
                  size="small"
                  class="w-full text-right"
                >
                  <template #prefix>$</template>
                </n-input>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Toggle to show more services -->
      <div class="flex justify-end">
        <n-button text size="tiny" type="primary" @click="showAllServices = !showAllServices">
          {{
            showAllServices
              ? 'Mostrar solo servicios de esta orden'
              : '+ Agregar tarifa de otro servicio'
          }}
        </n-button>
      </div>

      <!-- Travel Expenses Row -->
      <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs"
      >
        <div>
          <span class="font-medium text-slate-800 block">Viáticos / Costo de salida</span>
          <span class="text-slate-400 text-[11px]">Traslado acordado para esta orden</span>
        </div>
        <div class="w-full sm:w-44">
          <n-input
            v-model:value="travelExpenses"
            type="text"
            :input-props="{ inputmode: 'decimal' }"
            placeholder="0.00"
            size="small"
          >
            <template #prefix>$</template>
          </n-input>
        </div>
      </div>

      <!-- Adjustment Justification Reason -->
      <div class="pt-2 border-t border-slate-100 space-y-1">
        <label class="block text-xs font-medium text-slate-700">
          Motivo o justificación <span class="text-slate-400 font-normal">(opcional)</span>
        </label>
        <n-input
          v-model:value="reason"
          type="textarea"
          :maxlength="500"
          show-count
          placeholder="Ej. Tarifa convenida por día festivo o recargo de traslado..."
          :rows="2"
        />
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <n-button :disabled="isSubmitting || updatePricingPending" @click="closePricingModal">
          Cancelar
        </n-button>
        <n-button
          type="primary"
          :loading="isSubmitting || updatePricingPending"
          @click="handleSave"
        >
          {{ isFinalized ? 'Aplicar Ajuste' : 'Guardar Tarifas' }}
        </n-button>
      </div>
    </div>
  </n-modal>
</template>
