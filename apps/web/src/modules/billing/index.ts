import type { RouteRecordRaw } from 'vue-router';

export const billingRoutes: RouteRecordRaw[] = [
  {
    path: '/billing',
    name: 'billing',
    meta: { requiresRoles: ['ADMIN', 'BILLING'] },
    component: () => import('./views/BillingView.vue'),
  },
];
