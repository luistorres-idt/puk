import type { SessionUser } from '@puk/contracts';
import type { RouteLocationRaw, RouteMeta, RouteRecordNameGeneric } from 'vue-router';

export interface SessionAccessRoute {
  fullPath: string;
  meta: RouteMeta;
  name: RouteRecordNameGeneric;
}

export function resolveSessionAccessRedirect(
  user: SessionUser | null,
  route: SessionAccessRoute,
): RouteLocationRaw | undefined {
  if (route.meta.public === true) {
    if (user !== null && route.name === 'login') {
      return user.orderAccessMode === 'SHARED' ? { name: 'work-order' } : { name: 'home' };
    }
    return undefined;
  }

  if (user === null) return { name: 'login', query: { redirect: route.fullPath } };

  if (user.orderAccessMode === 'SHARED') {
    if (route.name !== 'work-order' && route.name !== 'order-execution') {
      return { name: 'work-order' };
    }
    return undefined;
  }

  if (route.name === 'work-order') return { name: 'home' };

  if (route.meta.requiresRole !== undefined && user.role !== route.meta.requiresRole) {
    return { name: 'home' };
  }

  return undefined;
}
