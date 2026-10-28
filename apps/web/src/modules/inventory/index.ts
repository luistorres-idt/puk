import type { RouteRecordRaw } from 'vue-router';

export const inventoryRoutes: RouteRecordRaw[] = [
  {
    component: () => import('./views/EquipmentView.vue'),
    meta: { requiresRole: 'ADMIN' },
    name: 'admin-equipment',
    path: '/admin/equipment',
  },
];
