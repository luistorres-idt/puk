<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPagination,
  NPopconfirm,
  NSpin,
  NTable,
  NTag,
  useMessage,
} from 'naive-ui';
import type { InventoryEquipment } from '@puk/contracts';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { useInventory } from '../useInventory.js';

const {
  equipment,
  search,
  state,
  selectedId,
  selected,
  filtered,
  loading,
  saving,
  error,
  formError,
  load,
  update,
  remove,
} = useInventory();
const message = useMessage();
const imei = ref('');
const brand = ref('');
const model = ref('');
const editModalOpen = ref(false);
const page = ref(1);
const pageSize = 15;
const visibleEquipment = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);
watch([search, state], () => {
  page.value = 1;
});
watch(filtered, () => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(filtered.value.length / pageSize)));
});
watch(selected, (item) => {
  imei.value = item?.imei ?? '';
  brand.value = item?.brand ?? '';
  model.value = item?.model ?? '';
  if (!item) editModalOpen.value = false;
});
watch(editModalOpen, (open) => {
  if (!open && !saving.value) selectedId.value = null;
});
/** Opens the metadata editor modal populated with the selected equipment row. */
function edit(item: InventoryEquipment): void {
  selectedId.value = item.id;
  formError.value = null;
  editModalOpen.value = true;
}

/** Closes the editor modal and clears selection unless a save request is in flight. */
function closeEditor(): void {
  if (saving.value) return;
  editModalOpen.value = false;
  selectedId.value = null;
}

/** Submits the edited IMEI, brand, and model, keeping the modal open on recoverable conflicts. */
async function save(): Promise<void> {
  if (selected.value && (await update(selected.value, imei.value, brand.value, model.value))) {
    message.success('Equipo actualizado.');
    editModalOpen.value = false;
    selectedId.value = null;
  }
}

/** Archives an available equipment record and notifies the user on completion. */
async function deleteEquipment(item: InventoryEquipment): Promise<void> {
  if (await remove(item)) message.success('Equipo eliminado.');
}
onMounted(() => {
  void load();
});
</script>

<template>
  <app-layout>
    <section class="space-y-5">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">Equipos</h1>
          <p class="text-sm text-slate-600">
            Administra los equipos registrados en la base de datos.
          </p>
        </div>
        <n-button :loading="loading" :disabled="saving || loading" @click="load"
          >Actualizar lista</n-button
        >
      </header>
      <n-alert type="info"
        >El estado, cliente y unidad se actualizan mediante las órdenes. Los equipos de Google
        Sheets no se administran aquí.</n-alert
      >
      <n-alert v-if="error" type="error">{{ error }}</n-alert>
      <n-card title="Equipos registrados">
        <div class="mb-4 flex flex-col gap-3 sm:flex-row">
          <n-input
            v-model:value="search"
            clearable
            placeholder="Buscar IMEI, marca, modelo, cliente o unidad"
            :input-props="{ 'aria-label': 'Buscar equipos' }"
          />
          <label class="flex shrink-0 items-center gap-2 text-sm">
            Estado
            <select
              v-model="state"
              aria-label="Estado del equipo"
              class="rounded border border-slate-300 bg-transparent px-3 py-2"
            >
              <option value="">Todos</option>
              <option value="AVAILABLE">Disponible</option>
              <option value="INSTALLED">Instalado</option>
            </select>
          </label>
        </div>
        <p class="mb-3 text-sm text-slate-600">
          {{ filtered.length }} de {{ equipment.length }} equipos
        </p>
        <n-spin :show="loading">
          <n-empty
            v-if="!filtered.length && !loading"
            :description="
              equipment.length
                ? 'No hay equipos que coincidan con los filtros.'
                : 'No hay equipos registrados.'
            "
          />
          <template v-else-if="filtered.length">
            <div class="overflow-x-auto">
              <n-table :single-line="false">
                <thead>
                  <tr>
                    <th>IMEI</th>
                    <th>Marca / modelo</th>
                    <th>Estado</th>
                    <th>Cliente / unidad</th>
                    <th>Reserva</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in visibleEquipment" :key="item.id">
                    <td class="font-mono">{{ item.imei }}</td>
                    <td>{{ item.brand }} / {{ item.model }}</td>
                    <td>
                      <n-tag :type="item.state === 'AVAILABLE' ? 'success' : 'info'" size="small">{{
                        item.state === 'AVAILABLE' ? 'Disponible' : 'Instalado'
                      }}</n-tag>
                    </td>
                    <td>
                      <p>{{ item.currentClientName || 'Sin cliente' }}</p>
                      <p class="text-xs text-slate-500">
                        {{ item.unitLabel || 'Sin unidad'
                        }}<span v-if="item.unitSerialNumber"> · {{ item.unitSerialNumber }}</span>
                      </p>
                    </td>
                    <td>
                      <router-link
                        v-if="item.reservedOrderId"
                        :to="`/orders/${item.reservedOrderId}`"
                        class="text-blue-600 underline"
                        >Ver orden reservada</router-link
                      ><span v-else>Sin reserva</span>
                    </td>
                    <td>
                      <div class="flex gap-2">
                        <n-button
                          size="small"
                          :disabled="saving || loading"
                          :aria-label="`Editar equipo ${item.imei}`"
                          @click="edit(item)"
                          >Editar</n-button
                        >
                        <n-popconfirm
                          v-if="item.canDelete"
                          positive-text="Eliminar equipo"
                          negative-text="Cancelar"
                          @positive-click="deleteEquipment(item)"
                        >
                          <template #trigger
                            ><n-button
                              size="small"
                              type="error"
                              :disabled="saving || loading"
                              :aria-label="`Eliminar equipo ${item.imei}`"
                              >Eliminar</n-button
                            ></template
                          >
                          ¿Retirar del inventario el equipo {{ item.imei }}? Se conservarán su ficha
                          y los registros históricos de las órdenes.
                        </n-popconfirm>
                        <span v-else class="text-xs text-slate-500"
                          >Eliminación bloqueada: instalado, reservado o ligado a una orden
                          activa.</span
                        >
                      </div>
                    </td>
                  </tr>
                </tbody>
              </n-table>
            </div>
            <n-pagination
              v-if="filtered.length > pageSize"
              v-model:page="page"
              class="mt-4"
              :page-size="pageSize"
              :item-count="filtered.length"
            />
          </template>
        </n-spin>
      </n-card>
      <n-modal
        v-if="selected"
        v-model:show="editModalOpen"
        preset="card"
        title="Editar equipo"
        class="max-w-xl"
        :style="{ width: 'calc(100vw - 32px)' }"
        :mask-closable="!saving"
        :close-on-esc="!saving"
      >
        <div class="space-y-4">
          <p class="text-sm text-slate-600">
            Estás editando el equipo con IMEI
            <span class="font-mono font-medium">{{ selected.imei }}</span
            >. El IMEI nuevo debe ser único y se verificará contra Google Sheets.
          </p>
          <n-alert v-if="formError" type="error">{{ formError }}</n-alert>
          <n-form @submit.prevent="save">
            <div class="grid gap-4">
              <n-form-item label="IMEI">
                <n-input
                  v-model:value="imei"
                  inputmode="numeric"
                  :maxlength="15"
                  :disabled="saving || loading"
                  :input-props="{ 'aria-label': 'IMEI del equipo' }"
                />
              </n-form-item>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <n-form-item label="Marca">
                <n-input
                  v-model:value="brand"
                  :maxlength="200"
                  :disabled="saving || loading"
                  :input-props="{ 'aria-label': 'Marca del equipo' }"
                />
              </n-form-item>
              <n-form-item label="Modelo">
                <n-input
                  v-model:value="model"
                  :maxlength="200"
                  :disabled="saving || loading"
                  :input-props="{ 'aria-label': 'Modelo del equipo' }"
                />
              </n-form-item>
            </div>
            <div class="flex justify-end gap-2">
              <n-button :disabled="saving" @click="closeEditor">Cancelar</n-button>
              <n-button
                attr-type="submit"
                type="primary"
                :loading="saving"
                :disabled="
                  saving ||
                  loading ||
                  !/^\d{15}$/.test(imei.trim()) ||
                  !brand.trim() ||
                  !model.trim()
                "
                >Guardar cambios</n-button
              >
            </div>
          </n-form>
        </div>
      </n-modal>
    </section>
  </app-layout>
</template>
