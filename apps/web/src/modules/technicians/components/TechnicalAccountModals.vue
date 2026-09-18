<script setup lang="ts">
import type { AdminUserListItem } from '@puk/contracts';
import { NAlert, NButton, NInput, NModal } from 'naive-ui';

defineProps<{
  createError: string | null;
  creating: boolean;
  editEmail: string;
  editError: string | null;
  editName: string;
  newEmail: string;
  newName: string;
  newPassword: string;
  newPasswordInput: string;
  passwordError: string | null;
  showCreateModal: boolean;
  showEditModal: boolean;
  showPasswordModal: boolean;
  targetUser: AdminUserListItem | null;
  updatingPassword: boolean;
  updatingUser: boolean;
}>();

const emit = defineEmits<{
  'update:createError': [value: string | null];
  'update:editEmail': [value: string];
  'update:editError': [value: string | null];
  'update:editName': [value: string];
  'update:newEmail': [value: string];
  'update:newName': [value: string];
  'update:newPassword': [value: string];
  'update:newPasswordInput': [value: string];
  'update:passwordError': [value: string | null];
  'update:showCreateModal': [value: boolean];
  'update:showEditModal': [value: boolean];
  'update:showPasswordModal': [value: boolean];
  create: [];
  resetPassword: [];
  updateUser: [];
}>();
</script>

<template>
  <n-modal
    :show="showCreateModal"
    preset="card"
    title="Crear Nueva Cuenta Técnica"
    class="w-[92vw] max-w-md"
    @update:show="emit('update:showCreateModal', $event)"
  >
    <div class="space-y-4">
      <n-alert v-if="createError" type="error" closable @close="emit('update:createError', null)">
        {{ createError }}
      </n-alert>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Nombre</label>
        <n-input
          :value="newName"
          placeholder="Ej. Técnico Taller Norte"
          @update:value="emit('update:newName', $event)"
        />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Correo Electrónico</label>
        <n-input
          :value="newEmail"
          placeholder="taller@empresa.com"
          @update:value="emit('update:newEmail', $event)"
        />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Contraseña Inicial</label>
        <n-input
          :value="newPassword"
          type="password"
          show-password-on="click"
          placeholder="Mínimo 12 caracteres"
          @update:value="emit('update:newPassword', $event)"
        />
        <p class="mt-1 text-xs text-slate-400">Debe tener al menos 12 caracteres.</p>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <n-button :disabled="creating" @click="emit('update:showCreateModal', false)">
          Cancelar
        </n-button>
        <n-button type="primary" :loading="creating" @click="emit('create')">
          Crear Cuenta
        </n-button>
      </div>
    </div>
  </n-modal>

  <n-modal
    :show="showPasswordModal"
    preset="card"
    :title="`Restablecer Contraseña · ${targetUser?.name ?? ''}`"
    class="w-[92vw] max-w-md"
    @update:show="emit('update:showPasswordModal', $event)"
  >
    <div class="space-y-4">
      <p class="text-xs text-slate-600">
        Ingresa la nueva contraseña para <strong>{{ targetUser?.email }}</strong
        >.
      </p>
      <n-alert
        v-if="passwordError"
        type="error"
        closable
        @close="emit('update:passwordError', null)"
      >
        {{ passwordError }}
      </n-alert>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Nueva Contraseña</label>
        <n-input
          :value="newPasswordInput"
          type="password"
          show-password-on="click"
          placeholder="Mínimo 12 caracteres"
          @update:value="emit('update:newPasswordInput', $event)"
        />
        <p class="mt-1 text-xs text-slate-400">Debe tener al menos 12 caracteres.</p>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <n-button :disabled="updatingPassword" @click="emit('update:showPasswordModal', false)">
          Cancelar
        </n-button>
        <n-button type="primary" :loading="updatingPassword" @click="emit('resetPassword')">
          Guardar Contraseña
        </n-button>
      </div>
    </div>
  </n-modal>

  <n-modal
    :show="showEditModal"
    preset="card"
    title="Editar Cuenta Técnica"
    class="w-[92vw] max-w-md"
    @update:show="emit('update:showEditModal', $event)"
  >
    <div class="space-y-4">
      <n-alert v-if="editError" type="error" closable @close="emit('update:editError', null)">
        {{ editError }}
      </n-alert>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Nombre</label>
        <n-input
          :value="editName"
          placeholder="Nombre completo"
          @update:value="emit('update:editName', $event)"
        />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Correo Electrónico</label>
        <n-input
          :value="editEmail"
          placeholder="correo@empresa.com"
          @update:value="emit('update:editEmail', $event)"
        />
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <n-button :disabled="updatingUser" @click="emit('update:showEditModal', false)">
          Cancelar
        </n-button>
        <n-button type="primary" :loading="updatingUser" @click="emit('updateUser')">
          Guardar Cambios
        </n-button>
      </div>
    </div>
  </n-modal>
</template>
