<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import { NAlert, NButton } from 'naive-ui';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import SharedAccountPanel from '../components/SharedAccountPanel.vue';
import TechnicalAccountModals from '../components/TechnicalAccountModals.vue';
import TechnicalAccountTable from '../components/TechnicalAccountTable.vue';
import { useTechnicalAccounts } from '../useTechnicalAccounts.js';

const accounts = reactive(useTechnicalAccounts());

onMounted(() => {
  void accounts.loadData();
});
</script>

<template>
  <app-layout>
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Cuentas Técnicas</h1>
          <p class="mt-1 text-sm text-slate-600">
            Administración de accesos, credenciales y designación de la cuenta compartida de taller.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <n-button secondary size="small" :loading="accounts.loading" @click="accounts.loadData">
            Refrescar
          </n-button>
          <n-button type="primary" size="small" @click="accounts.openCreateModal">
            + Nueva Cuenta Técnica
          </n-button>
        </div>
      </div>

      <n-alert
        v-if="accounts.error"
        type="error"
        closable
        class="text-xs"
        @close="accounts.error = null"
      >
        {{ accounts.error }}
      </n-alert>

      <shared-account-panel
        :config="accounts.config"
        :options="accounts.sharedSelectOptions"
        :saving="accounts.savingShared"
        :selected-user-id="accounts.selectedSharedUserId"
        @save="accounts.handleSaveSharedAccount"
        @update:selected-user-id="accounts.selectedSharedUserId = $event"
      />

      <technical-account-table
        :config="accounts.config"
        :filtered-technicians="accounts.filteredTechnicians"
        :loading="accounts.loading"
        :search="accounts.search"
        :technician-count="accounts.technicianUsers.length"
        @edit="accounts.openEditModal"
        @password="accounts.openPasswordModal"
        @toggle-active="accounts.handleToggleActive"
        @update:search="accounts.search = $event"
      />

      <technical-account-modals
        :create-error="accounts.createError"
        :creating="accounts.creating"
        :edit-email="accounts.editEmail"
        :edit-error="accounts.editError"
        :edit-name="accounts.editName"
        :new-email="accounts.newEmail"
        :new-name="accounts.newName"
        :new-password="accounts.newPassword"
        :new-password-input="accounts.newPasswordInput"
        :password-error="accounts.passwordError"
        :show-create-modal="accounts.showCreateModal"
        :show-edit-modal="accounts.showEditModal"
        :show-password-modal="accounts.showPasswordModal"
        :target-user="accounts.targetUser"
        :updating-password="accounts.updatingPassword"
        :updating-user="accounts.updatingUser"
        @create="accounts.handleCreateUser"
        @reset-password="accounts.handleResetPassword"
        @update-user="accounts.handleUpdateUserData"
        @update:create-error="accounts.createError = $event"
        @update:edit-email="accounts.editEmail = $event"
        @update:edit-error="accounts.editError = $event"
        @update:edit-name="accounts.editName = $event"
        @update:new-email="accounts.newEmail = $event"
        @update:new-name="accounts.newName = $event"
        @update:new-password="accounts.newPassword = $event"
        @update:new-password-input="accounts.newPasswordInput = $event"
        @update:password-error="accounts.passwordError = $event"
        @update:show-create-modal="accounts.showCreateModal = $event"
        @update:show-edit-modal="accounts.showEditModal = $event"
        @update:show-password-modal="accounts.showPasswordModal = $event"
      />
    </div>
  </app-layout>
</template>
