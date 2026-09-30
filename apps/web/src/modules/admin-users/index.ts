import type { RouteRecordRaw } from 'vue-router';

export const adminUserRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/AdminUsersView.vue'),
    meta: { requiresRole: 'ADMIN' },
    name: 'admin-users',
    path: '/admin/users',
  },
];
