import type { RouteRecordRaw } from 'vue-router';

export const technicianRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/TechniciansView.vue'),
    meta: { requiresRole: 'ADMIN' },
    name: 'technicians',
    path: '/technicians',
  },
  {
    component: () => import('./views/TechnicalAccountsView.vue'),
    meta: { requiresRole: 'ADMIN' },
    name: 'technical-accounts',
    path: '/technical-accounts',
  },
];

export * from './api.js';
export * from './technician-filter.js';
export { default as TechnicianSelect } from './components/TechnicianSelect.vue';
