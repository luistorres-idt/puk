import type { RouteRecordRaw } from 'vue-router';

export const technicianRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/TechniciansView.vue'),
    meta: { requiresRole: 'ADMIN' },
    name: 'technicians',
    path: '/technicians',
  },
];
