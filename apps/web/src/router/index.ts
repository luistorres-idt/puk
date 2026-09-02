import { createRouter, createWebHistory } from 'vue-router';

import { homeRoutes } from '@/modules/home';

export const router = createRouter({
  history: createWebHistory(),
  routes: [...homeRoutes],
  scrollBehavior: () => ({ left: 0, top: 0 }),
});
