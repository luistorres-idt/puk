<script setup lang="ts">
import { NAlert, NButton, NCard, NForm, NFormItem, NInput } from 'naive-ui';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function submit(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    await session.login(email.value, password.value);
    await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/');
  } catch {
    error.value = 'El correo o la contraseña no son válidos.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-slate-100 px-4 py-10">
    <n-card class="w-full max-w-md shadow-sm" size="large">
      <div class="mb-6 space-y-2">
        <p class="text-sm font-semibold tracking-wide text-blue-800 uppercase">Bull Dog Solution</p>
        <h1 class="text-2xl font-bold text-slate-900">Iniciar sesión</h1>
        <p class="text-sm text-slate-600">Accede a tus órdenes de servicio.</p>
      </div>
      <n-alert v-if="error" class="mb-4" type="error">{{ error }}</n-alert>
      <n-form @submit.prevent="submit">
        <n-form-item label="Correo">
          <n-input
            v-model:value="email"
            aria-label="Correo"
            placeholder="correo@ejemplo.com"
            autocomplete="username"
            type="text"
          />
        </n-form-item>
        <n-form-item label="Contraseña">
          <n-input
            v-model:value="password"
            aria-label="Contraseña"
            placeholder="••••••••"
            autocomplete="current-password"
            show-password-on="click"
            type="password"
          />
        </n-form-item>
        <n-button attr-type="submit" block :loading="loading" type="primary">Entrar</n-button>
      </n-form>
    </n-card>
  </main>
</template>
