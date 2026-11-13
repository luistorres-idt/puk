<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  NButton,
  NCard,
  NDivider,
  NDrawer,
  NDrawerContent,
  NInput,
  NSelect,
  NSpin,
  NTag,
  NTimePicker,
} from 'naive-ui';
import type { UpdateTechnicalReportSyncSchedule } from '@puk/contracts';

type ScheduleFormState = UpdateTechnicalReportSyncSchedule & {
  adminRecipientEmail: string | null;
  consolidatedRecipientEmail: string | null;
};

const props = defineProps<{
  form: ScheduleFormState;
  nextSyncLabel: string;
  cutoffLabel: string;
  weekdays: ReadonlyArray<{ label: string; value: number }>;
  timeZoneOptions: ReadonlyArray<{ label: string; value: string }>;
  isPending: boolean;
  isSaving: boolean;
  isDispatching: boolean;
}>();

const emit = defineEmits<{
  save: [payload: ScheduleFormState];
  dispatch: [];
}>();

const drawerOpen = ref(false);
const draft = reactive<ScheduleFormState>({ ...props.form });

watch(
  () => props.form,
  (next) => {
    Object.assign(draft, next);
  },
  { deep: true, immediate: true },
);

const hasRecipients = computed(() =>
  Boolean(props.form.adminRecipientEmail?.trim() || props.form.consolidatedRecipientEmail?.trim()),
);

const activeRecipientsCount = computed(() => {
  let count = 0;
  if (props.form.adminRecipientEmail?.trim()) count += 1;
  if (props.form.consolidatedRecipientEmail?.trim()) count += 1;
  return count;
});

function openDrawer(): void {
  Object.assign(draft, props.form);
  drawerOpen.value = true;
}

function handleSave(): void {
  emit('save', { ...draft });
  drawerOpen.value = false;
}
</script>

<template>
  <div>
    <n-card data-tour="sync-schedule" size="small" class="shadow-sm">
      <div v-if="isPending" class="grid min-h-14 place-items-center">
        <n-spin size="small" />
      </div>
      <div v-else class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold text-slate-800">
              Próximo envío: {{ nextSyncLabel }}
            </span>
            <n-tag size="small" :type="hasRecipients ? 'success' : 'warning'" :bordered="false">
              {{
                hasRecipients
                  ? `${activeRecipientsCount} destinatario(s) activo(s)`
                  : 'Sin destinatarios de correo'
              }}
            </n-tag>
          </div>
          <p class="text-xs text-slate-500">
            Corte semanal: final del {{ cutoffLabel }} · Zona: {{ form.timeZone }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <n-button secondary @click="openDrawer">Configurar horario y correos</n-button>
          <n-button
            type="info"
            secondary
            :disabled="!hasRecipients"
            :loading="isDispatching"
            @click="emit('dispatch')"
          >
            Enviar reportes ahora
          </n-button>
        </div>
      </div>
    </n-card>

    <n-drawer v-model:show="drawerOpen" :width="440" placement="right">
      <n-drawer-content title="Configuración de envío semanal" closable>
        <div class="space-y-5">
          <div>
            <h3 class="text-sm font-semibold text-slate-800">Programación de corte</h3>
            <p class="mb-3 text-xs text-slate-500">
              Define cuándo cierra la semana y cuándo se sincronizan los reportes.
            </p>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">Día de corte</label>
                <n-select v-model:value="draft.cutoffWeekday" :options="[...weekdays]" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">Día de envío</label>
                <n-select v-model:value="draft.syncWeekday" :options="[...weekdays]" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">Hora de envío</label>
                <n-time-picker
                  class="w-full"
                  :formatted-value="draft.syncTime"
                  format="HH:mm"
                  value-format="HH:mm"
                  input-readonly
                  @update:formatted-value="(value) => value && (draft.syncTime = value)"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">Zona horaria</label>
                <n-select
                  v-model:value="draft.timeZone"
                  :options="[...timeZoneOptions]"
                  filterable
                />
              </div>
            </div>
          </div>

          <n-divider />

          <div>
            <h3 class="text-sm font-semibold text-slate-800">Destinatarios de reportes Excel</h3>
            <p class="mb-3 text-xs text-slate-500">
              Deja vacío un campo si no deseas enviar ese formato automáticamente.
            </p>
            <div class="space-y-4">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">
                  Individual por técnico
                </label>
                <n-input
                  v-model:value="draft.adminRecipientEmail"
                  placeholder="admin@empresa.com"
                  clearable
                />
                <p class="mt-1 text-xs text-slate-400">
                  Recibe un archivo Excel separado por cada técnico.
                </p>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">
                  Consolidado semanal
                </label>
                <n-input
                  v-model:value="draft.consolidatedRecipientEmail"
                  placeholder="reportes@empresa.com"
                  clearable
                />
                <p class="mt-1 text-xs text-slate-400">
                  Recibe un único archivo Excel con todos los técnicos.
                </p>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <n-button @click="drawerOpen = false">Cancelar</n-button>
            <n-button type="primary" :loading="isSaving" @click="handleSave">
              Guardar cambios
            </n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
