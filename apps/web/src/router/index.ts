import { createRouter, createWebHistory } from 'vue-router';

import { authRoutes } from '@/modules/auth';
import { homeRoutes } from '@/modules/home';
import { orderRoutes } from '@/modules/orders';
import { technicianRoutes } from '@/modules/technicians';
import { useSessionStore } from '@/stores/session';

export const router = createRouter({
  history: createWebHistory(),
  routes: [...authRoutes, ...homeRoutes, ...technicianRoutes, ...orderRoutes],
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.initialize();
  if (to.meta.public === true)
    return session.isAuthenticated && to.name === 'login' ? { name: 'home' } : true;
  if (!session.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.requiresRole !== undefined && session.user?.role !== to.meta.requiresRole)
    return { name: 'home' };
  return true;
});
