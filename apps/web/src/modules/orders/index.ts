import type { RouteRecordRaw } from 'vue-router';

export * from './api.js';
export { default as OrdersListView } from './views/OrdersListView.vue';
export { default as OrderCreateWizardView } from './views/OrderCreateWizardView.vue';
export { default as OrderDetailView } from './views/OrderDetailView.vue';

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
    name: 'orders-detail',
    path: '/orders/:id',
  },
];
