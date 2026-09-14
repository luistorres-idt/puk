<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpin,
  NTable,
  NTag,
  useMessage,
} from 'naive-ui';
import type { SharedTechnicianAccessConfig } from '@puk/contracts';
import {
  type AdminUserListItem,
  createAdminUser,
  getSharedTechnicianAccess,
  listAdminUsers,
  updateAdminUser,
  updateSharedTechnicianAccount,
} from '@/modules/orders';
import AppLayout from '@/shared/layouts/AppLayout.vue';

const message = useMessage();

const loading = ref(true);
const savingShared = ref(false);
const error = ref<string | null>(null);

const config = ref<SharedTechnicianAccessConfig | null>(null);
const users = ref<AdminUserListItem[]>([]);
const search = ref('');
const selectedSharedUserId = ref<string | null>(null);

// Modal Crear Cuenta
const showCreateModal = ref(false);
const creating = ref(false);
const newName = ref('');
const newEmail = ref('');
const newPassword = ref('');
const createError = ref<string | null>(null);

// Modal Cambiar Contraseña
const showPasswordModal = ref(false);
const updatingPassword = ref(false);
const targetUser = ref<AdminUserListItem | null>(null);
const newPasswordInput = ref('');
const passwordError = ref<string | null>(null);

// Modal Editar Usuario
const showEditModal = ref(false);
const updatingUser = ref(false);
const editName = ref('');
const editEmail = ref('');
const editError = ref<string | null>(null);

async function loadData(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [cfg, userList] = await Promise.all([getSharedTechnicianAccess(), listAdminUsers()]);
    config.value = cfg;
    users.value = userList;
    selectedSharedUserId.value = cfg.userId;
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Error al cargar la información de cuentas técnicas.';
  } finally {
    loading.value = false;
  }
}

// Filtramos únicamente las cuentas con rol TECHNICIAN
const technicianUsers = computed(() =>
  users.value.filter((user) => user.role === 'TECHNICIAN'),
);

const filteredTechnicians = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return technicianUsers.value;
  return technicianUsers.value.filter(
    (u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query),
  );
});

// Candidatos para ser cuenta compartida (rol TECHNICIAN sin technicianId asignado y activos)
const sharedCandidates = computed(() =>
  technicianUsers.value.filter((user) => user.active && user.technicianId === null),
);

const sharedSelectOptions = computed(() => [
  { label: '— Sin cuenta asignada —', value: '' },
  ...sharedCandidates.value.map((u) => ({
    label: `${u.name} (${u.email})`,
    value: u.id,
  })),
]);

async function handleSaveSharedAccount(): Promise<void> {
  if (!config.value) return;
  savingShared.value = true;
  error.value = null;
  try {
    const targetUserId =
      selectedSharedUserId.value && selectedSharedUserId.value.length > 0
        ? selectedSharedUserId.value
        : null;
    const updated = await updateSharedTechnicianAccount({
      expectedRevision: config.value.revision,
      userId: targetUserId,
    });
    config.value = updated;
    selectedSharedUserId.value = updated.userId;
    message.success('Cuenta técnica compartida actualizada correctamente.');
    await loadData();
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
      ?.error?.message;
    error.value = msg || 'Error al guardar la designación de cuenta compartida.';
    await loadData();
  } finally {
    savingShared.value = false;
  }
}

function openCreateModal(): void {
  newName.value = '';
  newEmail.value = '';
  newPassword.value = '';
  createError.value = null;
  showCreateModal.value = true;
}

async function handleCreateUser(): Promise<void> {
  const name = newName.value.trim();
  const email = newEmail.value.trim();
  const password = newPassword.value;

  if (!name) {
    createError.value = 'El nombre es obligatorio.';
    return;
  }
  if (!email || !email.includes('@')) {
    createError.value = 'Ingresa un correo electrónico válido.';
    return;
  }
  if (password.length < 12) {
    createError.value = 'La contraseña debe tener al menos 12 caracteres.';
    return;
  }

  creating.value = true;
  createError.value = null;
  try {
    const created = await createAdminUser({
      email,
      name,
      password,
      role: 'TECHNICIAN',
      technicianId: null,
    });
    message.success(`Cuenta creada para ${created.name}`);
    await loadData();
    showCreateModal.value = false;
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
      ?.error?.message;
    createError.value = msg || 'Error al crear la cuenta técnica.';
  } finally {
    creating.value = false;
  }
}

function openPasswordModal(user: AdminUserListItem): void {
  targetUser.value = user;
  newPasswordInput.value = '';
  passwordError.value = null;
  showPasswordModal.value = true;
}

async function handleResetPassword(): Promise<void> {
  if (!targetUser.value) return;
  if (newPasswordInput.value.length < 12) {
    passwordError.value = 'La nueva contraseña debe tener al menos 12 caracteres.';
    return;
  }

  updatingPassword.value = true;
  passwordError.value = null;
  try {
    await updateAdminUser(targetUser.value.id, {
      password: newPasswordInput.value,
    });
    message.success(`Contraseña actualizada para ${targetUser.value.name}`);
    showPasswordModal.value = false;
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
      ?.error?.message;
    passwordError.value = msg || 'Error al restablecer la contraseña.';
  } finally {
    updatingPassword.value = false;
  }
}

function openEditModal(user: AdminUserListItem): void {
  targetUser.value = user;
  editName.value = user.name;
  editEmail.value = user.email;
  editError.value = null;
  showEditModal.value = true;
}

async function handleUpdateUserData(): Promise<void> {
  if (!targetUser.value) return;
  const name = editName.value.trim();
  const email = editEmail.value.trim();

  if (!name) {
    editError.value = 'El nombre es obligatorio.';
    return;
  }
  if (!email || !email.includes('@')) {
    editError.value = 'Ingresa un correo válido.';
    return;
  }

  updatingUser.value = true;
  editError.value = null;
  try {
    await updateAdminUser(targetUser.value.id, { email, name });
    message.success('Datos actualizados.');
    showEditModal.value = false;
    await loadData();
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
      ?.error?.message;
    editError.value = msg || 'Error al actualizar los datos.';
  } finally {
    updatingUser.value = false;
  }
}

async function handleToggleActive(user: AdminUserListItem): Promise<void> {
  try {
    await updateAdminUser(user.id, { active: !user.active });
    message.success(`Cuenta ${!user.active ? 'activada' : 'desactivada'}.`);
    await loadData();
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
      ?.error?.message;
    message.error(msg || 'Error al modificar el estado de la cuenta.');
  }
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <app-layout>
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Cuentas Técnicas</h1>
          <p class="mt-1 text-sm text-slate-600">
            Administración de accesos, credenciales y designación de la cuenta compartida de taller.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <n-button secondary size="small" :loading="loading" @click="loadData">
            Refrescar
          </n-button>
          <n-button type="primary" size="small" @click="openCreateModal">
            + Nueva Cuenta Técnica
          </n-button>
        </div>
      </div>

      <n-alert v-if="error" type="error" closable class="text-xs" @close="error = null">
        {{ error }}
      </n-alert>

      <!-- Panel de Cuenta Compartida de Taller -->
      <n-card class="border border-blue-200 bg-blue-50/20 shadow-sm" size="small">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-800">Cuenta Compartida de Taller (Kiosco / Tablet)</span>
              <n-tag v-if="config" size="small" type="info" round>
                Revisión: #{{ config.revision }}
              </n-tag>
            </div>
            <n-tag size="small" :type="config?.userId ? 'success' : 'default'" round>
              {{ config?.userId ? 'Tablero Multi-Orden Activo' : 'Sin Cuenta Asignada' }}
            </n-tag>
          </div>
        </template>
        <p class="text-xs text-slate-600 mb-3">
          La cuenta seleccionada aquí tendrá acceso al Tablero de Taller para que los operarios
          ejecuten cualquiera de las órdenes asignadas en paralelo sin requerir autorizaciones 1 a 1.
        </p>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <n-select
            v-model:value="selectedSharedUserId"
            size="small"
            :options="sharedSelectOptions"
            class="flex-1"
            placeholder="Seleccionar cuenta de técnico para taller"
          />
          <n-button
            type="primary"
            size="small"
            :loading="savingShared"
            :disabled="!config || selectedSharedUserId === config.userId"
            @click="handleSaveSharedAccount"
          >
            Guardar Cuenta Designada
          </n-button>
        </div>
      </n-card>

      <!-- Buscador y Tabla de Cuentas -->
      <n-card class="shadow-sm">
        <div class="mb-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <h2 class="text-base font-semibold text-slate-800">
            Listado de Cuentas de Técnicos ({{ technicianUsers.length }})
          </h2>
          <n-input
            v-model:value="search"
            placeholder="Buscar por nombre o correo..."
            clearable
            size="small"
            class="w-full sm:w-72"
          />
        </div>

        <div v-if="loading" class="grid min-h-48 place-items-center">
          <n-spin size="medium" />
        </div>

        <n-empty
          v-else-if="filteredTechnicians.length === 0"
          description="No se encontraron cuentas técnicas"
        />

        <div v-else class="overflow-x-auto">
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
                <td class="font-medium text-slate-900">
                  {{ user.name }}
                </td>
                <td class="text-slate-600 font-mono text-xs">
                  {{ user.email }}
                </td>
                <td>
                  <n-tag
                    v-if="user.id === config?.userId"
                    size="small"
                    type="info"
                    round
                  >
                    Cuenta Compartida Taller
                  </n-tag>
                  <n-tag
                    v-else-if="user.technicianId"
                    size="small"
                    type="default"
                    round
                  >
                    Técnico Individual
                  </n-tag>
                  <n-tag
                    v-else
                    size="small"
                    type="warning"
                    round
                  >
                    Cuenta Taller (Libre)
                  </n-tag>
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
                      @click="openPasswordModal(user)"
                    >
                      Cambiar Contraseña
                    </n-button>
                    <n-button
                      size="tiny"
                      secondary
                      @click="openEditModal(user)"
                    >
                      Editar
                    </n-button>
                    <n-popconfirm
                      :positive-text="user.active ? 'Desactivar' : 'Activar'"
                      negative-text="Cancelar"
                      @positive-click="handleToggleActive(user)"
                    >
                      <template #trigger>
                        <n-button
                          size="tiny"
                          secondary
                          :type="user.active ? 'error' : 'success'"
                        >
                          {{ user.active ? 'Desactivar' : 'Activar' }}
                        </n-button>
                      </template>
                      ¿Estás seguro de que deseas {{ user.active ? 'desactivar' : 'activar' }} la cuenta de {{ user.name }}?
                    </n-popconfirm>
                  </div>
                </td>
              </tr>
            </tbody>
          </n-table>
        </div>
      </n-card>

      <!-- Modal Crear Cuenta -->
      <n-modal
        v-model:show="showCreateModal"
        preset="card"
        title="Crear Nueva Cuenta Técnica"
        class="max-w-md"
      >
        <div class="space-y-4">
          <n-alert v-if="createError" type="error" closable @close="createError = null">
            {{ createError }}
          </n-alert>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Nombre</label>
            <n-input v-model:value="newName" placeholder="Ej. Técnico Taller Norte" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Correo Electrónico</label>
            <n-input v-model:value="newEmail" placeholder="taller@empresa.com" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Contraseña Inicial</label>
            <n-input
              v-model:value="newPassword"
              type="password"
              show-password-on="click"
              placeholder="Mínimo 12 caracteres"
            />
            <p class="mt-1 text-xs text-slate-400">Debe tener al menos 12 caracteres.</p>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <n-button :disabled="creating" @click="showCreateModal = false"> Cancelar </n-button>
            <n-button type="primary" :loading="creating" @click="handleCreateUser">
              Crear Cuenta
            </n-button>
          </div>
        </div>
      </n-modal>

      <!-- Modal Cambiar Contraseña -->
      <n-modal
        v-model:show="showPasswordModal"
        preset="card"
        :title="`Restablecer Contraseña · ${targetUser?.name ?? ''}`"
        class="max-w-md"
      >
        <div class="space-y-4">
          <p class="text-xs text-slate-600">
            Ingresa la nueva contraseña para <strong>{{ targetUser?.email }}</strong>.
          </p>
          <n-alert v-if="passwordError" type="error" closable @close="passwordError = null">
            {{ passwordError }}
          </n-alert>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Nueva Contraseña</label>
            <n-input
              v-model:value="newPasswordInput"
              type="password"
              show-password-on="click"
              placeholder="Mínimo 12 caracteres"
            />
            <p class="mt-1 text-xs text-slate-400">Debe tener al menos 12 caracteres.</p>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <n-button :disabled="updatingPassword" @click="showPasswordModal = false">
              Cancelar
            </n-button>
            <n-button type="primary" :loading="updatingPassword" @click="handleResetPassword">
              Guardar Contraseña
            </n-button>
          </div>
        </div>
      </n-modal>

      <!-- Modal Editar Datos -->
      <n-modal
        v-model:show="showEditModal"
        preset="card"
        title="Editar Cuenta Técnica"
        class="max-w-md"
      >
        <div class="space-y-4">
          <n-alert v-if="editError" type="error" closable @close="editError = null">
            {{ editError }}
          </n-alert>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Nombre</label>
            <n-input v-model:value="editName" placeholder="Nombre completo" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Correo Electrónico</label>
            <n-input v-model:value="editEmail" placeholder="correo@empresa.com" />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <n-button :disabled="updatingUser" @click="showEditModal = false"> Cancelar </n-button>
            <n-button type="primary" :loading="updatingUser" @click="handleUpdateUserData">
              Guardar Cambios
            </n-button>
          </div>
        </div>
      </n-modal>
    </main>
  </app-layout>
</template>
