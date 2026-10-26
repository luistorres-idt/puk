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
  NPopconfirm,
  NSelect,
  NSpin,
  NTable,
  useMessage,
} from 'naive-ui';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { useClients } from '../useClients.js';

const {
  clients,
  selectedId,
  selected,
  loading,
  saving,
  error,
  formError,
  load,
  register,
  rename,
  saveEmail,
  removeEmail,
} = useClients();
const message = useMessage();
const newName = ref('');
const name = ref('');
const email = ref('');
const emailId = ref<string | undefined>();
const clientOptions = computed(() =>
  clients.value.map((client) => ({
    label: `${client.name} (${client.clientSheetId})`,
    value: client.id,
  })),
);
watch(selected, (client) => {
  name.value = client?.name ?? '';
  cancelEmail();
  formError.value = null;
});
function cancelEmail(): void {
  email.value = '';
  emailId.value = undefined;
}
async function create(): Promise<void> {
  if (await register(newName.value)) {
    newName.value = '';
    message.success('Cliente registrado.');
  }
}
async function saveName(): Promise<void> {
  if (selected.value && (await rename(selected.value.id, name.value)))
    message.success('Nombre actualizado.');
}
async function submitEmail(): Promise<void> {
  if (selected.value && (await saveEmail(selected.value.id, email.value, emailId.value))) {
    cancelEmail();
    message.success('Correo guardado.');
  }
}
async function deleteEmail(id: string): Promise<void> {
  if (selected.value && (await removeEmail(selected.value.id, id))) {
    if (emailId.value === id) cancelEmail();
    message.success('Correo eliminado.');
  }
}
onMounted(() => {
  void load();
});
</script>

<template>
  <app-layout>
    <section class="space-y-5">
      <header>
        <h1 class="text-2xl font-bold">Clientes y correos</h1>
        <p class="text-sm text-slate-600">
          Crea clientes y administra sus destinatarios de reportes en la base de datos.
        </p>
      </header>
      <n-alert v-if="error" type="error"
        >{{ error }} <n-button size="small" @click="load">Reintentar</n-button></n-alert
      >
      <n-alert v-if="formError" type="error">{{ formError }}</n-alert>
      <n-card title="Registrar cliente">
        <n-form @submit.prevent="create">
          <n-form-item label="Nombre en el sistema">
            <n-input
              v-model:value="newName"
              :disabled="saving"
              :maxlength="200"
              :input-props="{ 'aria-label': 'Nombre del nuevo cliente' }"
            />
          </n-form-item>
          <n-button
            attr-type="submit"
            type="primary"
            :loading="saving"
            :disabled="saving || !newName.trim()"
            >Registrar</n-button
          >
        </n-form>
      </n-card>
      <n-spin :show="loading">
        <n-card title="Clientes registrados">
          <n-empty v-if="!clients.length && !loading" description="No hay clientes registrados." />
          <template v-else>
            <n-select
              v-model:value="selectedId"
              filterable
              :options="clientOptions"
              :disabled="saving || loading"
              :input-props="{ 'aria-label': 'Cliente registrado' }"
              placeholder="Selecciona un cliente"
            />
            <template v-if="selected">
              <p class="my-4 text-sm text-slate-600">
                Identificador del cliente: {{ selected.clientSheetId }}. Este identificador no se
                modifica.
              </p>
              <n-form @submit.prevent="saveName">
                <n-form-item label="Nombre en el sistema"
                  ><n-input
                    v-model:value="name"
                    :disabled="saving"
                    :maxlength="200"
                    :input-props="{ 'aria-label': 'Nombre del cliente' }"
                /></n-form-item>
                <n-button attr-type="submit" :loading="saving" :disabled="!name.trim()"
                  >Guardar nombre</n-button
                >
              </n-form>
              <h2 class="mt-6 mb-3 text-lg font-semibold">Correos del cliente</h2>
              <div v-if="selected.emails.length" class="overflow-x-auto">
                <n-table :single-line="false">
                  <thead>
                    <tr>
                      <th>Correo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="recipient in selected.emails" :key="recipient.id">
                      <td class="break-all">{{ recipient.email }}</td>
                      <td>
                        <div class="flex flex-wrap gap-2">
                          <n-button
                            size="small"
                            :disabled="saving"
                            @click="
                              email = recipient.email;
                              emailId = recipient.id;
                            "
                            >Editar</n-button
                          >
                          <n-popconfirm
                            positive-text="Confirmar"
                            negative-text="Cancelar"
                            @positive-click="deleteEmail(recipient.id)"
                            ><template #trigger
                              ><n-button size="small" type="error" :disabled="saving"
                                >Eliminar</n-button
                              ></template
                            >¿Eliminar este correo?</n-popconfirm
                          >
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </n-table>
              </div>
              <n-empty v-else description="El cliente todavía no tiene correos." />
              <n-form class="mt-4" @submit.prevent="submitEmail">
                <n-form-item :label="emailId ? 'Editar correo' : 'Agregar correo'"
                  ><n-input
                    v-model:value="email"
                    :disabled="saving"
                    :maxlength="254"
                    :input-props="{ 'aria-label': 'Correo del cliente' }"
                    placeholder="correo@ejemplo.com"
                /></n-form-item>
                <n-button
                  attr-type="submit"
                  type="primary"
                  :loading="saving"
                  :disabled="!email.trim()"
                  >{{ emailId ? 'Guardar correo' : 'Agregar correo' }}</n-button
                >
                <n-button v-if="emailId" :disabled="saving" @click="cancelEmail">Cancelar</n-button>
              </n-form>
            </template>
          </template>
        </n-card>
      </n-spin>
    </section>
  </app-layout>
</template>
