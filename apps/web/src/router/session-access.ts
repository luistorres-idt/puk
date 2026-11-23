import type { SessionUser, UserRole } from '@puk/contracts';
import type { RouteLocationRaw, RouteMeta, RouteRecordNameGeneric } from 'vue-router';

export interface SessionAccessRoute {
  fullPath: string;
  meta: RouteMeta;
  name: RouteRecordNameGeneric;
}

function defaultRouteForUser(user: SessionUser): RouteLocationRaw {
  if (user.orderAccessMode === 'SHARED') return { name: 'work-order' };
  if (user.role === 'BILLING') return { name: 'billing' };
  return { name: 'home' };
}

export function resolveSessionAccessRedirect(
  user: SessionUser | null,
  route: SessionAccessRoute,
): RouteLocationRaw | undefined {
  if (route.meta.public === true) {
    if (user !== null && route.name === 'login') {
      return defaultRouteForUser(user);
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

  if (user.role === 'BILLING') {
    if (route.name !== 'billing') {
      return { name: 'billing' };
    }
    return undefined;
  }

  if (route.name === 'work-order') return { name: 'home' };

  const requiresRoles = route.meta.requiresRoles as readonly UserRole[] | undefined;
  if (requiresRoles !== undefined && !requiresRoles.includes(user.role)) {
    return defaultRouteForUser(user);
  }

  if (route.meta.requiresRole !== undefined && user.role !== route.meta.requiresRole) {
    return defaultRouteForUser(user);
  }

  return undefined;
}
