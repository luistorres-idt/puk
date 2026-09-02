import type { RouteRecordRaw } from 'vue-router';

export const homeRoutes: readonly RouteRecordRaw[] = [
  {
    component: () => import('../views/HomeView.vue'),
    name: 'home',
    path: '/',
  },
];
