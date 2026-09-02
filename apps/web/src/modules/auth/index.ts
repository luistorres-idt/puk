import type { RouteRecordRaw } from 'vue-router';

export const authRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/LoginView.vue'),
    meta: { public: true },
    name: 'login',
    path: '/login',
  },
];
