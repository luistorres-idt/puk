import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';

import { authRoutes } from '@/modules/auth';
import { homeRoutes } from '@/modules/home';
import { orderRoutes } from '@/modules/orders';
import { serviceExecutionRoutes } from '@/modules/service-execution';
import { technicianRoutes } from '@/modules/technicians';
import { syncRoutes } from '@/modules/sync';
import { clientRoutes } from '@/modules/clients';
import { adminUserRoutes } from '@/modules/admin-users';
import { useSessionStore } from '@/stores/session';
import { resolveSessionAccessRedirect } from './session-access';

export const router = createRouter({
  history: typeof window !== 'undefined' ? createWebHistory() : createMemoryHistory(),
  routes: [
    ...authRoutes,
    ...homeRoutes,
    ...technicianRoutes,
    ...adminUserRoutes,
    ...clientRoutes,
    ...syncRoutes,
    ...orderRoutes,
    ...serviceExecutionRoutes,
  ],
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.initialize();
  if (to.meta.public !== true && session.isAuthenticated) {
    try {
      await session.revalidateIdentity();
    } catch {
      // Keep the last known identity on transient authority/network failures.
      // The API remains the authorization boundary for every protected operation.
    }
  }

  return resolveSessionAccessRedirect(session.user, to) ?? true;
});
