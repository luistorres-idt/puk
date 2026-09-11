import type { RouteRecordRaw } from 'vue-router';

export const syncRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/SyncOperationsView.vue'),
    meta: { requiresRole: 'ADMIN' },
    name: 'sync-operations',
    path: '/sync',
  },
];

export * from './api.js';
