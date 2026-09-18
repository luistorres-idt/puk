import type { SessionUser } from '@puk/contracts';
import type { RouteLocationRaw } from 'vue-router';

import { resolveSessionAccessRedirect, type SessionAccessRoute } from './session-access';

interface RevalidatableSession {
  revalidateIdentity(options: { force: boolean }): Promise<SessionUser | null>;
}

interface SessionAccessRouter {
  currentRoute: { value: SessionAccessRoute };
  replace(target: RouteLocationRaw): Promise<unknown>;
}

export async function reconcileCurrentSessionAccess(
  session: RevalidatableSession,
  router: SessionAccessRouter,
): Promise<boolean> {
  try {
    const user = await session.revalidateIdentity({ force: true });
    const redirect = resolveSessionAccessRedirect(user, router.currentRoute.value);
    if (redirect === undefined) return false;
    await router.replace(redirect);
    return true;
  } catch {
    return false;
  }
}

export function installIdentityFocusRevalidation(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  session: RevalidatableSession,
  router: SessionAccessRouter,
): () => void {
  const handleFocus = (): void => {
    void reconcileCurrentSessionAccess(session, router);
  };
  target.addEventListener('focus', handleFocus);
  return () => target.removeEventListener('focus', handleFocus);
}
