import type { RouteRecordRaw } from 'vue-router';

export const clientRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/ClientsView.vue'),
    meta: { requiresRole: 'ADMIN' },
    name: 'admin-clients',
    path: '/admin/clients',
  },
];

export { addClientEmail } from './api.js';
