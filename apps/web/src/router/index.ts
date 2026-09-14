import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';

import { authRoutes } from '@/modules/auth';
import { homeRoutes } from '@/modules/home';
import { orderRoutes } from '@/modules/orders';
import { serviceExecutionRoutes } from '@/modules/service-execution';
import { technicianRoutes } from '@/modules/technicians';
import { syncRoutes } from '@/modules/sync';
import { useSessionStore } from '@/stores/session';

export const router = createRouter({
  history: typeof window !== 'undefined' ? createWebHistory() : createMemoryHistory(),
  routes: [
    ...authRoutes,
    ...homeRoutes,
    ...technicianRoutes,
    ...syncRoutes,
    ...orderRoutes,
    ...serviceExecutionRoutes,
  ],
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.initialize();
  if (to.meta.public === true) {
    if (session.isAuthenticated && to.name === 'login') {
      return session.user?.orderAccessMode === 'SHARED' ? { name: 'work-order' } : { name: 'home' };
    }
    return true;
  }
  if (!session.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };

  if (session.user?.orderAccessMode === 'SHARED') {
    if (to.name !== 'work-order' && to.name !== 'order-execution') {
      return { name: 'work-order' };
    }
    return true;
  }

  if (to.name === 'work-order') {
    return { name: 'home' };
  }

  if (to.meta.requiresRole !== undefined && session.user?.role !== to.meta.requiresRole)
    return { name: 'home' };
  return true;
});
