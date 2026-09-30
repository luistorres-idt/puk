<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AdminUserListItem } from '@puk/contracts';
import {
  NAlert,
  NButton,
  NEmpty,
  NInput,
  NModal,
  NPopconfirm,
  NSpin,
  NTable,
  NTag,
  useMessage,
} from 'naive-ui';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { useSessionStore } from '@/stores/session';
import { createAdmin as createAdminUser, listAdmins, updateAdmin } from '../api.js';

const session = useSessionStore();
const message = useMessage();
const users = ref<AdminUserListItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const search = ref('');
const showCreate = ref(false);
const showEdit = ref(false);
const showPassword = ref(false);
const saving = ref(false);
const formError = ref<string | null>(null);
const target = ref<AdminUserListItem | null>(null);
const name = ref('');
const email = ref('');
const password = ref('');
const newPassword = ref('');

const admins = computed(() => users.value.filter((user) => user.role === 'ADMIN'));
const filteredAdmins = computed(() => {
  const query = search.value.trim().toLowerCase();
  return query
    ? admins.value.filter(
        (user) =>
          user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query),
      )
    : admins.value;
});
const activeAdminCount = computed(() => admins.value.filter((user) => user.active).length);

watch(showCreate, (open) => {
  if (!open) password.value = '';
});
watch(showPassword, (open) => {
  if (!open) newPassword.value = '';
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    users.value = await listAdmins();
  } catch {
    error.value = 'No se pudieron cargar las cuentas administradoras.';
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  name.value = '';
  email.value = '';
  password.value = '';
  formError.value = null;
  showCreate.value = true;
}
function openEdit(user: AdminUserListItem): void {
  target.value = user;
  name.value = user.name;
  email.value = user.email;
  formError.value = null;
  showEdit.value = true;
}
function openPassword(user: AdminUserListItem): void {
  target.value = user;
  newPassword.value = '';
  formError.value = null;
  showPassword.value = true;
}

async function createAdmin(): Promise<void> {
  saving.value = true;
  formError.value = null;
  try {
    await createAdminUser({
      name: name.value,
      email: email.value,
      password: password.value,
    });
    showCreate.value = false;
    message.success('Cuenta administradora creada.');
    await load();
  } catch (err) {
    formError.value = apiMessage(err, 'No se pudo crear la cuenta.');
  } finally {
    saving.value = false;
  }
}

async function saveProfile(): Promise<void> {
  if (!target.value) return;
  saving.value = true;
  formError.value = null;
  try {
    await updateAdmin(target.value.id, { name: name.value, email: email.value });
    showEdit.value = false;
    message.success('Cuenta actualizada.');
    await load();
  } catch (err) {
    formError.value = apiMessage(err, 'No se pudo actualizar la cuenta.');
  } finally {
    saving.value = false;
  }
}

async function savePassword(): Promise<void> {
  if (!target.value) return;
  saving.value = true;
  formError.value = null;
  try {
    await updateAdmin(target.value.id, { password: newPassword.value });
    showPassword.value = false;
    message.success('Contraseña actualizada.');
  } catch (err) {
    formError.value = apiMessage(err, 'No se pudo actualizar la contraseña.');
  } finally {
    saving.value = false;
  }
}

async function toggleActive(user: AdminUserListItem): Promise<void> {
  try {
    await updateAdmin(user.id, { active: !user.active });
    message.success(user.active ? 'Cuenta desactivada.' : 'Cuenta activada.');
    await load();
  } catch (err) {
    message.error(apiMessage(err, 'No se pudo cambiar el estado de la cuenta.'));
  }
}

function apiMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { error?: { message?: string } } } })?.response;
  return response?.data?.error?.message ?? fallback;
}

onMounted(() => {
  void load();
});
</script>

<template>
  <app-layout>
    <section class="space-y-5">
      <header class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Administradores</h1>
          <p class="mt-1 text-sm text-slate-600">Gestioná las cuentas con acceso administrativo.</p>
        </div>
        <div class="flex gap-2">
          <n-button secondary size="small" :loading="loading" @click="load">Actualizar</n-button>
          <n-button type="primary" size="small" @click="openCreate">Nuevo administrador</n-button>
        </div>
      </header>

      <n-alert v-if="error" type="error" role="alert">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span>{{ error }}</span
          ><n-button size="small" @click="load">Reintentar</n-button>
        </div>
      </n-alert>

      <n-card class="shadow-sm">
        <div class="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 class="font-semibold">Cuentas administradoras ({{ filteredAdmins.length }})</h2>
          <n-input
            v-model:value="search"
            clearable
            size="small"
            class="w-full sm:max-w-xs"
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar administradores"
          />
        </div>
        <div
          v-if="loading && users.length === 0"
          class="grid min-h-40 place-items-center"
          aria-live="polite"
        >
          <n-spin />
        </div>
        <n-empty
          v-else-if="!error && filteredAdmins.length === 0"
          description="No hay administradores para mostrar"
        />
        <div v-else-if="filteredAdmins.length" class="overflow-x-auto">
          <n-table :bordered="false" :single-line="false" size="small">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Estado</th>
                <th class="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in filteredAdmins" :key="user.id">
                <td class="font-medium">
                  {{ user.name
                  }}<span v-if="user.id === session.user?.id" class="ml-2 text-xs text-slate-500"
                    >Tu cuenta</span
                  >
                </td>
                <td class="break-all">{{ user.email }}</td>
                <td>
                  <n-tag size="small" round :type="user.active ? 'success' : 'error'">{{
                    user.active ? 'Activo' : 'Inactivo'
                  }}</n-tag>
                </td>
                <td>
                  <div class="flex flex-wrap justify-end gap-2">
                    <n-button
                      size="tiny"
                      secondary
                      :aria-label="`Editar ${user.name}`"
                      @click="openEdit(user)"
                      >Editar</n-button
                    >
                    <n-button
                      size="tiny"
                      secondary
                      :aria-label="`Cambiar contraseña de ${user.name}`"
                      @click="openPassword(user)"
                      >Contraseña</n-button
                    >
                    <n-popconfirm
                      :positive-text="user.active ? 'Desactivar' : 'Activar'"
                      negative-text="Cancelar"
                      @positive-click="toggleActive(user)"
                    >
                      <template #trigger
                        ><n-button
                          size="tiny"
                          secondary
                          :type="user.active ? 'error' : 'success'"
                          :disabled="
                            user.id === session.user?.id || (user.active && activeAdminCount <= 1)
                          "
                          :aria-label="`${user.active ? 'Desactivar' : 'Activar'} ${user.name}`"
                          >{{ user.active ? 'Desactivar' : 'Activar' }}</n-button
                        ></template
                      >
                      ¿Querés {{ user.active ? 'desactivar' : 'activar' }} la cuenta de
                      {{ user.name }}?
                    </n-popconfirm>
                  </div>
                </td>
              </tr>
            </tbody>
          </n-table>
        </div>
      </n-card>

      <n-modal
        v-model:show="showCreate"
        preset="card"
        title="Nuevo administrador"
        class="w-[92vw] max-w-md"
      >
        <div class="space-y-4">
          <n-alert v-if="formError" type="error">{{ formError }}</n-alert>
          <label class="block text-sm"
            >Nombre<n-input v-model:value="name" autocomplete="name"
          /></label>
          <label class="block text-sm"
            >Correo<n-input v-model:value="email" type="text" autocomplete="email"
          /></label>
          <label class="block text-sm"
            >Contraseña inicial<n-input
              v-model:value="password"
              type="password"
              show-password-on="click"
              autocomplete="new-password"
            /><span class="text-xs text-slate-500">Mínimo 12 caracteres.</span></label
          >
          <div class="flex justify-end gap-2">
            <n-button :disabled="saving" @click="showCreate = false">Cancelar</n-button
            ><n-button
              type="primary"
              :loading="saving"
              :disabled="!name.trim() || !email.trim() || !password"
              @click="createAdmin"
              >Crear cuenta</n-button
            >
          </div>
        </div>
      </n-modal>
      <n-modal
        v-model:show="showEdit"
        preset="card"
        title="Editar administrador"
        class="w-[92vw] max-w-md"
      >
        <div class="space-y-4">
          <n-alert v-if="formError" type="error">{{ formError }}</n-alert>
          <label class="block text-sm"
            >Nombre<n-input v-model:value="name" autocomplete="name"
          /></label>
          <label class="block text-sm"
            >Correo<n-input v-model:value="email" type="text" autocomplete="email"
          /></label>
          <div class="flex justify-end gap-2">
            <n-button :disabled="saving" @click="showEdit = false">Cancelar</n-button
            ><n-button
              type="primary"
              :loading="saving"
              :disabled="!name.trim() || !email.trim()"
              @click="saveProfile"
              >Guardar</n-button
            >
          </div>
        </div>
      </n-modal>
      <n-modal
        v-model:show="showPassword"
        preset="card"
        :title="`Cambiar contraseña · ${target?.name ?? ''}`"
        class="w-[92vw] max-w-md"
      >
        <div class="space-y-4">
          <p class="text-sm text-slate-600">
            La contraseña nueva no se vuelve a mostrar después de guardarla.
          </p>
          <n-alert v-if="formError" type="error">{{ formError }}</n-alert>
          <label class="block text-sm"
            >Nueva contraseña<n-input
              v-model:value="newPassword"
              type="password"
              show-password-on="click"
              autocomplete="new-password"
            /><span class="text-xs text-slate-500">Mínimo 12 caracteres.</span></label
          >
          <div class="flex justify-end gap-2">
            <n-button :disabled="saving" @click="showPassword = false">Cancelar</n-button
            ><n-button
              type="primary"
              :loading="saving"
              :disabled="newPassword.length < 12"
              @click="savePassword"
              >Guardar contraseña</n-button
            >
          </div>
        </div>
      </n-modal>
    </section>
  </app-layout>
</template>
