<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NInput,
  NPagination,
  NPopconfirm,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
  useMessage,
} from 'naive-ui';
import type { CreateTechnician, UpdateTechnician } from '@puk/contracts';

import AppLayout from '@/shared/layouts/AppLayout.vue';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import TechnicianFormDrawer from '../components/TechnicianFormDrawer.vue';
import {
  createTechnician,
  importTechniciansFromSheets,
  listTechnicians,
  updateTechnician,
  type Technician,
} from '../api.js';

const PAGE_SIZE = 15;

const message = useMessage();
const queryClient = useQueryClient();

const search = ref('');
const statusFilter = ref<'all' | 'active' | 'inactive'>('all');
const cityFilter = ref<string | null>(null);
const page = ref(1);
const drawerOpen = ref(false);
const editingTechnician = ref<Technician | null>(null);

const statusOptions = [
  { label: 'Todos los estados', value: 'all' },
  { label: 'Solo activos', value: 'active' },
  { label: 'Solo inactivos', value: 'inactive' },
];

const technicians = useQuery({
  queryFn: listTechnicians,
  queryKey: ['technicians'],
});

const cityOptions = computed(() => {
  const cities = new Set<string>();
  for (const tech of technicians.data.value ?? []) {
    if (tech.city?.trim()) cities.add(tech.city.trim());
  }
  return Array.from(cities)
    .sort((a, b) => a.localeCompare(b, 'es-MX'))
    .map((city) => ({ label: city, value: city }));
});

const counts = computed(() => {
  const list = technicians.data.value ?? [];
  const active = list.filter((t) => t.active).length;
  return { total: list.length, active, inactive: list.length - active };
});

const filteredTechnicians = computed(() => {
  const list = technicians.data.value ?? [];
  const query = search.value.trim().toLocaleLowerCase('es-MX');

  return list.filter((tech) => {
    if (statusFilter.value === 'active' && !tech.active) return false;
    if (statusFilter.value === 'inactive' && tech.active) return false;
    if (cityFilter.value && tech.city?.trim() !== cityFilter.value) return false;
    if (!query) return true;

    return [
      tech.name,
      tech.externalKey,
      tech.workshop,
      tech.city,
      tech.state,
      tech.phone,
      tech.email,
    ]
      .filter(Boolean)
      .some((field) => String(field).toLocaleLowerCase('es-MX').includes(query));
  });
});

watch([search, statusFilter, cityFilter], () => {
  page.value = 1;
});

const paginatedTechnicians = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filteredTechnicians.value.slice(start, start + PAGE_SIZE);
});

function formatCurrency(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function configuredRatesCount(tech: Technician): number {
  const keys = [
    tech.installationRate,
    tech.uninstallationRate,
    tech.replacementRate,
    tech.reviewRate,
    tech.fuelSensorRate,
    tech.failedAppointmentRate,
    tech.departureCost,
  ];
  return keys.filter((v) => v !== null && v !== undefined && v !== '').length;
}

async function invalidateTechnicianQueries(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['technicians'] }),
    queryClient.invalidateQueries({ queryKey: ['selectable-technicians'] }),
  ]);
}

const saveMutation = useMutation({
  mutationFn: async (payload: { id: string | null; data: CreateTechnician | UpdateTechnician }) => {
    if (payload.id) {
      return updateTechnician(payload.id, payload.data as UpdateTechnician);
    }
    return createTechnician(payload.data as CreateTechnician);
  },
  onSuccess: async (_result, variables) => {
    await invalidateTechnicianQueries();
    drawerOpen.value = false;
    message.success(variables.id ? 'Técnico actualizado.' : 'Técnico creado.');
  },
  onError: (error) =>
    message.error(extractApiErrorMessage(error, 'No se pudo guardar el técnico.')),
});

const toggleActiveMutation = useMutation({
  mutationFn: (tech: Technician) => updateTechnician(tech.id, { active: !tech.active }),
  onSuccess: async (updated) => {
    await invalidateTechnicianQueries();
    message.success(updated.active ? 'Técnico activado.' : 'Técnico desactivado.');
  },
  onError: (error) =>
    message.error(extractApiErrorMessage(error, 'No se pudo cambiar el estado del técnico.')),
});

const importMutation = useMutation({
  mutationFn: importTechniciansFromSheets,
  onSuccess: async (result) => {
    await invalidateTechnicianQueries();
    if (result.message) {
      message.info(result.message);
    } else {
      message.success(
        `Importación completada: ${result.synced} sincronizado(s), ${result.deactivated} desactivado(s).`,
      );
    }
  },
  onError: (error) =>
    message.error(extractApiErrorMessage(error, 'No se pudo importar desde Google Sheets.')),
});

function openCreate(): void {
  editingTechnician.value = null;
  drawerOpen.value = true;
}

function openEdit(tech: Technician): void {
  editingTechnician.value = tech;
  drawerOpen.value = true;
}
</script>

<template>
  <app-layout>
    <div data-tour-page="technicians" class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div data-tour="technicians-actions" class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-bold text-slate-900">Técnicos</h1>
            <n-tag v-if="counts.total > 0" size="small" :bordered="false">
              {{ counts.active }} activos / {{ counts.total }} total
            </n-tag>
          </div>
          <p class="mt-1 text-sm text-slate-600">
            Directorio, tarifas de servicio y datos fiscales del personal técnico.
          </p>
        </div>

        <div data-tour="technicians-actions" class="flex flex-wrap items-center gap-2">
          <n-popconfirm
            positive-text="Sí, importar"
            negative-text="Cancelar"
            @positive-click="importMutation.mutate()"
          >
            <template #trigger>
              <n-button secondary :loading="importMutation.isPending.value">
                Importar desde Sheets
              </n-button>
            </template>
            Esto importará los técnicos del Google Sheet actual y puede sobreescribir o desactivar
            registros que no estén en la hoja. ¿Continuar?
          </n-popconfirm>
          <n-button type="primary" @click="openCreate">Nuevo técnico</n-button>
        </div>
      </div>

      <n-card size="small" class="shadow-sm">
        <div data-tour="technicians-filters" class="mb-4 grid gap-3 md:grid-cols-4">
          <n-input
            v-model:value="search"
            class="md:col-span-2"
            placeholder="Buscar por nombre, ID (TEC-...), taller, teléfono o correo"
            clearable
          />
          <n-select
            v-model:value="cityFilter"
            :options="cityOptions"
            placeholder="Todas las ciudades"
            clearable
            filterable
          />
          <n-select v-model:value="statusFilter" :options="statusOptions" />
        </div>

        <div v-if="technicians.isPending.value" class="grid min-h-48 place-items-center">
          <n-spin />
        </div>
        <n-alert v-else-if="technicians.isError.value" type="error">
          No fue posible cargar el directorio.
        </n-alert>
        <n-empty
          v-else-if="filteredTechnicians.length === 0"
          description="No hay técnicos que coincidan con el filtro"
        />
        <div v-else data-tour="technicians-directory">
          <div class="overflow-x-auto">
            <table class="w-full min-w-[780px] text-left text-sm">
              <thead class="border-b border-slate-200/70 bg-slate-500/5 text-xs text-slate-500">
                <tr>
                  <th class="px-3 py-2.5 font-medium">Técnico</th>
                  <th class="px-3 py-2.5 font-medium">Ubicación</th>
                  <th class="px-3 py-2.5 font-medium">Contacto</th>
                  <th class="px-3 py-2.5 font-medium">Tarifas</th>
                  <th class="px-3 py-2.5 font-medium">Estado</th>
                  <th class="px-3 py-2.5 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/50">
                <tr
                  v-for="tech in paginatedTechnicians"
                  :key="tech.id"
                  class="cursor-pointer transition-colors hover:bg-slate-500/10"
                  @click="openEdit(tech)"
                >
                  <td class="px-3 py-2.5">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-slate-900">{{ tech.name }}</span>
                      <span
                        v-if="tech.externalKey"
                        class="rounded bg-slate-500/10 px-1.5 py-0.5 font-mono text-[11px] text-slate-600"
                      >
                        {{ tech.externalKey }}
                      </span>
                    </div>
                    <p class="text-xs text-slate-500">{{ tech.workshop || 'Sin taller' }}</p>
                  </td>

                  <td class="px-3 py-2.5 text-slate-700">
                    {{ [tech.city, tech.state].filter(Boolean).join(', ') || '—' }}
                  </td>

                  <td class="px-3 py-2.5">
                    <p class="text-slate-700">{{ tech.phone || '—' }}</p>
                    <p v-if="tech.email" class="text-xs text-slate-500">{{ tech.email }}</p>
                  </td>

                  <td class="px-3 py-2.5">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span
                        v-if="formatCurrency(tech.installationRate)"
                        class="text-xs text-slate-700"
                      >
                        Inst. {{ formatCurrency(tech.installationRate) }}
                      </span>
                      <n-tag size="tiny" :bordered="false" type="info">
                        {{ configuredRatesCount(tech) }}/7
                      </n-tag>
                    </div>
                  </td>

                  <td class="px-3 py-2.5" @click.stop>
                    <div class="flex items-center gap-2">
                      <n-switch
                        size="small"
                        :value="tech.active"
                        :loading="toggleActiveMutation.isPending.value"
                        @update:value="() => toggleActiveMutation.mutate(tech)"
                      />
                      <span
                        class="text-xs"
                        :class="tech.active ? 'text-emerald-700' : 'text-slate-400'"
                      >
                        {{ tech.active ? 'Activo' : 'Inactivo' }}
                      </span>
                    </div>
                  </td>

                  <td class="px-3 py-2.5 text-right" @click.stop>
                    <n-button size="tiny" secondary type="primary" @click="openEdit(tech)">
                      Editar
                    </n-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            v-if="filteredTechnicians.length > PAGE_SIZE"
            class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"
          >
            <span>
              Mostrando {{ (page - 1) * PAGE_SIZE + 1 }}–{{
                Math.min(page * PAGE_SIZE, filteredTechnicians.length)
              }}
              de {{ filteredTechnicians.length }} técnicos
            </span>
            <n-pagination
              v-model:page="page"
              :item-count="filteredTechnicians.length"
              :page-size="PAGE_SIZE"
            />
          </div>
        </div>
      </n-card>

      <technician-form-drawer
        v-model:show="drawerOpen"
        :technician="editingTechnician"
        :saving="saveMutation.isPending.value"
        @submit="(payload) => saveMutation.mutate(payload)"
      />
    </div>
  </app-layout>
</template>
