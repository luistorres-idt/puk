<script setup lang="ts">
import { toRefs } from 'vue';
import {
  NAlert,
  NButton,
  NInput,
  NInputNumber,
  NModal,
  NTag,
  useMessage,
} from 'naive-ui';
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
  distinctOrderServices,
  displayedServices,
  openPricingModal,
  closePricingModal,
  resetRateToBase,
  resetTravelExpenses,
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
    :title="
      isFinalized
        ? 'Ajustar Precios de Liquidación Técnica'
        : 'Configurar Tarifas Acordadas de la Orden'
    "
    class="w-[92vw] max-w-xl"
  >
    <div class="space-y-5">
      <!-- Context Alert -->
      <n-alert
        v-if="isFinalized"
        type="warning"
        title="Ajuste Contable Posterior al Cierre"
        :bordered="false"
      >
        Al guardar, se recalculará automáticamente la liquidación técnica con las nuevas tarifas,
        se generará una nueva versión contable y se programará la actualización hacia Google Sheets.
      </n-alert>
      <n-alert v-else type="info" title="Tarifas Personalizadas para la Orden" :bordered="false">
        Las tarifas ingresadas aquí sobreescribirán las tarifas base del técnico cuando la orden sea
        completada. Cualquier servicio que dejes vacío utilizará la tarifa base del catálogo.
      </n-alert>

      <!-- Order Context Info -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50 rounded border text-xs">
        <div>
          <span class="text-slate-400 block">Folio</span>
          <span class="font-bold text-slate-800">{{ order?.folio ?? '-' }}</span>
        </div>
        <div>
          <span class="text-slate-400 block">Cliente</span>
          <span class="font-semibold text-slate-800 truncate block">{{
            order?.clientNameSnapshot ?? '-'
          }}</span>
        </div>
        <div>
          <span class="text-slate-400 block">Técnico Asignado</span>
          <span class="font-semibold text-slate-800 truncate block">
            {{ order?.technician?.name ?? 'Sin asignar' }}
          </span>
        </div>
      </div>

      <!-- Services Rates Section -->
      <div class="space-y-3">
        <div class="flex justify-between items-center">
          <div>
            <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Tarifas por Servicio (MXN)
            </h4>
            <p class="text-[11px] text-slate-500">
              Personaliza el precio unitario por cada servicio ejecutado.
            </p>
          </div>
          <n-button
            text
            size="tiny"
            type="primary"
            @click="showAllServices = !showAllServices"
          >
            {{
              showAllServices
                ? 'Mostrar solo servicios de la orden'
                : 'Ver todos los servicios del catálogo'
            }}
          </n-button>
        </div>

        <div class="space-y-2.5">
          <div
            v-for="svc in displayedServices"
            :key="svc"
            class="p-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
          >
            <div class="flex justify-between items-center mb-1.5">
              <div class="flex items-center gap-1.5">
                <span class="font-semibold text-xs text-slate-800">
                  {{ ORDER_SERVICE_LABELS[svc] }}
                </span>
                <n-tag
                  v-if="distinctOrderServices.includes(svc)"
                  size="tiny"
                  type="info"
                  round
                >
                  En esta orden
                </n-tag>
              </div>
              <div class="text-[11px] text-slate-500">
                <span v-if="getTechnicianBaseRate(svc, order)" class="font-mono">
                  Base: ${{ Number(getTechnicianBaseRate(svc, order)).toFixed(2) }}
                </span>
                <span v-else class="italic text-slate-400">
                  Base: No configurada
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <n-input-number
                v-model:value="rates[svc]"
                :min="0"
                :precision="2"
                placeholder="Tarifa personalizada..."
                class="flex-1"
                size="small"
              >
                <template #prefix>$</template>
              </n-input-number>

              <n-button
                v-if="rates[svc] !== null && rates[svc] !== undefined"
                size="tiny"
                quaternary
                type="warning"
                @click="resetRateToBase(svc)"
              >
                Revertir a base
              </n-button>
            </div>
          </div>
        </div>
      </div>

      <!-- Travel Expenses Section -->
      <div class="space-y-2 pt-2 border-t border-slate-100">
        <div>
          <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Viáticos y Costo de Salida (MXN)
          </h4>
          <p class="text-[11px] text-slate-500">
            Monto convenido por concepto de traslado o salida técnica para esta orden.
          </p>
        </div>

        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2">
          <n-input-number
            v-model:value="travelExpenses"
            :min="0"
            :precision="2"
            placeholder="0.00"
            class="flex-1"
            size="small"
          >
            <template #prefix>$</template>
          </n-input-number>

          <n-button
            v-if="travelExpenses !== null && travelExpenses !== undefined"
            size="tiny"
            quaternary
            type="warning"
            @click="resetTravelExpenses"
          >
            Limpiar
          </n-button>
        </div>
      </div>

      <!-- Adjustment Justification Reason -->
      <div class="space-y-1.5 pt-2 border-t border-slate-100">
        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Motivo / Justificación del Ajuste (Opcional)
        </label>
        <n-input
          v-model:value="reason"
          type="textarea"
          :maxlength="500"
          show-count
          placeholder="Ej. Tarifa pactada por servicio en día festivo, o recargo autorizado por dificultad de acceso..."
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
          {{ isFinalized ? 'Aplicar Ajuste de Precios' : 'Guardar Tarifas' }}
        </n-button>
      </div>
    </div>
  </n-modal>
</template>
