import type { SessionUser } from '@puk/contracts';

export const TOUR_VERSION = 1;

export function progressKey(user: SessionUser, tourId: string): string {
  return `puk:onboarding:v${TOUR_VERSION}:${user.id}:${user.role}:${user.orderAccessMode}:${tourId}`;
}

export function createTourProgress(storage: () => Pick<Storage, 'getItem' | 'setItem'>) {
  const sharedSession = new Set<string>();
  return {
    completed(user: SessionUser, tourId: string): boolean {
      const key = progressKey(user, tourId);
      if (user.orderAccessMode === 'SHARED') return sharedSession.has(key);
      try {
        return storage().getItem(key) === 'completed';
      } catch {
        return false;
      }
    },
    complete(user: SessionUser, tourId: string): void {
      const key = progressKey(user, tourId);
      if (user.orderAccessMode === 'SHARED') {
        sharedSession.add(key);
        return;
      }
      try {
        storage().setItem(key, 'completed');
      } catch {
        // Help remains available when browser storage is blocked or full.
      }
    },
    clearSession(): void {
      sharedSession.clear();
    },
  };
}
