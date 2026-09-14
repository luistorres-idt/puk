import type { RouteRecordRaw } from 'vue-router';

export * from './api.js';
export * from './queries.js';

export const serviceExecutionRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/SharedTechnicianHomeView.vue'),
    name: 'work-order',
    path: '/work-order',
  },
  {
    component: () => import('./views/OrderExecutionView.vue'),
    name: 'order-execution',
    path: '/orders/:id/execute',
  },
];
