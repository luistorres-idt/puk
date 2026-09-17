import type { RouteRecordRaw } from 'vue-router';

export * from './api.js';
export * from './formatters.js';
export * from './queries.js';

export const orderRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/OrdersListView.vue'),
    name: 'orders',
    path: '/orders',
  },
  {
    component: () => import('./views/OrderCreateWizardView.vue'),
    meta: { requiresRole: 'ADMIN' },
    name: 'orders-new',
    path: '/orders/new',
  },
  {
    component: () => import('./views/OrderDetailView.vue'),
    meta: { requiresRole: 'ADMIN' },
    name: 'orders-detail',
    path: '/orders/:id',
  },
];
