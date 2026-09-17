import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import './app/styles.css';
import { installIdentityFocusRevalidation } from './router/identity-reconciliation';
import { router } from './router';
import { useSessionStore } from './stores/session';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(VueQueryPlugin);
app.mount('#app');

installIdentityFocusRevalidation(window, useSessionStore(pinia), router);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
