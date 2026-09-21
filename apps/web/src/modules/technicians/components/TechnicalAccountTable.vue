<script setup lang="ts">
import type { AdminUserListItem, SharedTechnicianAccessConfig } from '@puk/contracts';
import { NAlert, NButton, NEmpty, NInput, NPopconfirm, NSpin, NTable, NTag } from 'naive-ui';

defineProps<{
  config: SharedTechnicianAccessConfig | null;
  error: string | null;
  filteredTechnicians: AdminUserListItem[];
  loading: boolean;
  search: string;
  technicianCount: number;
}>();

const emit = defineEmits<{
  retry: [];
  'update:search': [value: string];
  edit: [user: AdminUserListItem];
  password: [user: AdminUserListItem];
  toggleActive: [user: AdminUserListItem];
}>();
</script>

<template>
  <n-card class="shadow-sm">
    <div class="mb-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
      <h2 class="text-base font-semibold text-slate-800">
        Listado de Cuentas de Técnicos ({{ technicianCount }})
      </h2>
      <n-input
        :value="search"
        placeholder="Buscar por nombre o correo..."
        clearable
        size="small"
        class="w-full sm:w-72"
        @update:value="emit('update:search', $event)"
      />
    </div>

    <n-alert v-if="error" type="error" class="mb-4" role="alert">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{{ error }}</span>
        <n-button size="small" secondary @click="emit('retry')">Reintentar</n-button>
      </div>
    </n-alert>

    <div
      v-if="loading && filteredTechnicians.length === 0"
      class="grid min-h-48 place-items-center"
      aria-live="polite"
    >
      <n-spin size="medium" />
    </div>

    <n-empty
      v-else-if="!loading && !error && filteredTechnicians.length === 0"
      description="No se encontraron cuentas técnicas"
    />

    <div v-else-if="filteredTechnicians.length > 0" class="overflow-x-auto">
      <n-table :bordered="false" :single-line="false" size="small">
        <thead>
          <tr class="bg-slate-50 text-slate-600 text-xs">
            <th>Nombre</th>
            <th>Correo</th>
            <th>Tipo de Acceso</th>
            <th>Estado</th>
            <th class="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filteredTechnicians" :key="user.id" class="text-sm">
            <td class="font-medium text-slate-900">{{ user.name }}</td>
            <td class="text-slate-600 font-mono text-xs">{{ user.email }}</td>
            <td>
              <n-tag v-if="user.id === config?.userId" size="small" type="info" round>
                Cuenta Compartida Taller
              </n-tag>
              <n-tag v-else-if="user.technicianId" size="small" type="default" round>
                Técnico Individual
              </n-tag>
              <n-tag v-else size="small" type="warning" round>Cuenta Taller (Libre)</n-tag>
            </td>
            <td>
              <n-tag size="small" :type="user.active ? 'success' : 'error'" round>
                {{ user.active ? 'Activo' : 'Inactivo' }}
              </n-tag>
            </td>
            <td class="text-right">
              <div class="flex items-center justify-end gap-2">
                <n-button
                  size="tiny"
                  secondary
                  type="info"
                  :aria-label="`Cambiar contraseña de ${user.name}`"
                  @click="emit('password', user)"
                >
                  Contraseña
                </n-button>
                <n-button
                  size="tiny"
                  secondary
                  :aria-label="`Editar cuenta de ${user.name}`"
                  @click="emit('edit', user)"
                >
                  Editar
                </n-button>
                <n-popconfirm
                  :positive-text="user.active ? 'Desactivar' : 'Activar'"
                  negative-text="Cancelar"
                  @positive-click="emit('toggleActive', user)"
                >
                  <template #trigger>
                    <n-button
                      size="tiny"
                      secondary
                      :type="user.active ? 'error' : 'success'"
                      :aria-label="`${user.active ? 'Desactivar' : 'Activar'} cuenta de ${user.name}`"
                    >
                      {{ user.active ? 'Desactivar' : 'Activar' }}
                    </n-button>
                  </template>
                  ¿Estás seguro de que deseas {{ user.active ? 'desactivar' : 'activar' }} la cuenta
                  de {{ user.name }}?
                </n-popconfirm>
              </div>
            </td>
          </tr>
        </tbody>
      </n-table>
    </div>
  </n-card>
</template>
