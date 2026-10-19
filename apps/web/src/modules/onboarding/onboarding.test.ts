import { describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@puk/contracts';
import type { Config, Driver, HookOpts, DestroyReason } from 'driver.js';
import { buildTour, type TourContext } from './catalog';
import { createTourController } from './controller';
import { createTourProgress, progressKey } from './progress';

const admin: SessionUser = {
  id: 'user-1',
  name: 'Admin',
  email: 'admin@example.invalid',
  role: 'ADMIN',
  active: true,
  orderAccessMode: 'INDIVIDUAL',
  technicianId: null,
};
const technician: SessionUser = { ...admin, role: 'TECHNICIAN' };
const shared: SessionUser = { ...technician, orderAccessMode: 'SHARED' };
const context: TourContext = { page: 'orders', status: '', step: '' };

function fakeDriver() {
  let config: Config = {};
  let index = 0;
  const end = (reason: DestroyReason) =>
    config.onDestroyed?.(undefined, {}, { reason } as HookOpts);
  const instance = {
    drive: vi.fn(),
    destroy: vi.fn(() => end('api')),
    getActiveIndex: () => index,
  } as unknown as Driver;
  return {
    instance,
    factory: vi.fn((options: Config) => {
      config = options;
      return instance;
    }),
    end,
    setIndex: (value: number) => {
      index = value;
    },
    config: () => config,
  };
}

describe('onboarding catalog and privacy', () => {
  it('offers creation only to an individual administrator', () => {
    expect(buildTour(admin, context).steps.some((s) => s.target === 'new-order')).toBe(true);
    for (const user of [technician, shared, { ...admin, orderAccessMode: 'SHARED' as const }]) {
      expect(buildTour(user, context).steps.some((s) => s.target === 'new-order')).toBe(false);
      expect(
        buildTour(user, { ...context, page: 'detail' }).steps.some(
          (s) => s.target === 'order-report',
        ),
      ).toBe(false);
    }
  });

  it('explains the current wizard step and correction without business actions', () => {
    const wizard = buildTour(admin, { ...context, page: 'wizard', step: '4' });
    expect(wizard.steps[0]?.description).toContain('técnico activo');
    const correction = buildTour(shared, {
      ...context,
      page: 'execution',
      status: 'REQUIRES_CORRECTION',
    });
    expect(correction.description).toContain('corrección');
    expect(correction.steps.some((s) => s.target === 'order-report')).toBe(false);
    expect(buildTour(admin, { ...context, page: 'wizard', step: '5' }).id).not.toBe(wizard.id);
  });

  it('only includes targets that exist in the current screen and state', () => {
    const home = buildTour(admin, { ...context, page: 'home' });
    expect(home.steps.map((item) => item.target)).toContain('new-order');
    expect(home.steps.map((item) => item.target)).not.toContain('order-filters');

    const assigned = buildTour(technician, {
      ...context,
      page: 'execution',
      status: 'ASSIGNED',
    });
    expect(assigned.steps.map((item) => item.target)).not.toContain('execution-checklist');
    expect(assigned.steps.map((item) => item.target)).not.toContain('execution-signature');

    const incomplete = buildTour(admin, {
      ...context,
      page: 'detail',
      status: 'IN_PROGRESS',
    });
    expect(incomplete.steps.map((item) => item.target)).not.toContain('order-report');
  });

  it('isolates progress by user, role, mode, tour and version without storing business data', () => {
    const values = new Map<string, string>();
    const progress = createTourProgress(() => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    }));
    progress.complete(admin, 'admin:home::');
    expect(progress.completed(admin, 'admin:home::')).toBe(true);
    expect(progress.completed({ ...admin, id: 'user-2' }, 'admin:home::')).toBe(false);
    expect(progress.completed(technician, 'admin:home::')).toBe(false);
    expect(progress.completed(admin, 'admin:detail::')).toBe(false);
    expect(progressKey(admin, 'home')).toContain(':v1:');
    expect([...values.values()]).toEqual(['completed']);
    expect([...values.keys()].join()).not.toContain(admin.email);
  });

  it('keeps shared completion only in memory and clears it for the next session', () => {
    const storage = vi.fn(() => {
      throw new Error('Shared account must not touch storage');
    });
    const progress = createTourProgress(storage);
    progress.complete(shared, 'shared:home::');
    expect(progress.completed(shared, 'shared:home::')).toBe(true);
    progress.clearSession();
    expect(progress.completed(shared, 'shared:home::')).toBe(false);
    expect(storage).not.toHaveBeenCalled();
  });

  it('does not fail when storage is blocked', () => {
    const progress = createTourProgress(() => {
      throw new Error('Blocked');
    });
    expect(() => progress.complete(admin, 'home')).not.toThrow();
    expect(progress.completed(admin, 'home')).toBe(false);
  });
});

describe('onboarding lifecycle', () => {
  it.each(['close', 'escape', 'overlay', 'api', 'replaced'] as const)(
    'does not mark %s as completion',
    async (reason) => {
      const fake = fakeDriver();
      const controller = createTourController(async () => fake.factory);
      const onComplete = vi.fn();
      await controller.start({ steps: [], reducedMotion: false, onComplete, onEnd: vi.fn() });
      fake.end(reason);
      expect(onComplete).not.toHaveBeenCalled();
    },
  );

  it('records explicit Done, disables interaction and respects reduced motion', async () => {
    const fake = fakeDriver();
    const controller = createTourController(async () => fake.factory);
    const onComplete = vi.fn();
    const onEnd = vi.fn();
    await controller.start({ steps: [], reducedMotion: true, onComplete, onEnd });
    expect(fake.config()).toMatchObject({
      animate: false,
      advanceOnClick: false,
      disableActiveInteraction: true,
    });
    fake.end('done');
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('cancels a pending import when route or identity changes', async () => {
    const fake = fakeDriver();
    let resolve!: (factory: (options: Config) => Driver) => void;
    const controller = createTourController(
      () =>
        new Promise((ready) => {
          resolve = ready;
        }),
    );
    const started = controller.start({
      steps: [],
      reducedMotion: false,
      onComplete: vi.fn(),
      onEnd: vi.fn(),
    });
    controller.stop();
    resolve(fake.factory);
    await started;
    expect(fake.factory).not.toHaveBeenCalled();
  });

  it('destroys an active tour without recording completion on teardown', async () => {
    const fake = fakeDriver();
    const onComplete = vi.fn();
    const onEnd = vi.fn();
    const controller = createTourController(async () => fake.factory);
    await controller.start({ steps: [], reducedMotion: false, onComplete, onEnd });
    controller.stop();
    expect(fake.instance.destroy).toHaveBeenCalledOnce();
    fake.end('done');
    expect(onComplete).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
