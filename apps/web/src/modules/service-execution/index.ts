import type { RouteRecordRaw } from 'vue-router';

export * from './api.js';
export { default as OrderExecutionView } from './views/OrderExecutionView.vue';

export const serviceExecutionRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/OrderExecutionView.vue'),
    name: 'order-execution',
    path: '/orders/:id/execute',
  },
];
