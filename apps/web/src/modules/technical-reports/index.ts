import type { RouteRecordRaw } from 'vue-router';

export const technicalReportRoutes: RouteRecordRaw[] = [
  {
    path: '/technical-reports',
    name: 'technical-reports',
    meta: { requiresRoles: ['ADMIN', 'BILLING'] },
    component: () => import('./views/TechnicalReportsView.vue'),
  },
];
