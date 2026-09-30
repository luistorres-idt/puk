import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from './index.js';
import { useSessionStore } from '@/stores/session.js';

describe('router navigation guards', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const session = useSessionStore();
    session.clearSession();
    // mock initialize to not call api.get / refreshSession
    vi.spyOn(session, 'initialize').mockImplementation(async () => {
      session.initialized = true;
    });
  });

  it('redirects unauthenticated users to login', async () => {
    await router.push('/orders');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('redirects shared technician from / to /work-order', async () => {
    const session = useSessionStore();
    session.acceptSession('test-token', {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Shared Tech',
      email: 'shared@example.com',
      role: 'TECHNICIAN',
      orderAccessMode: 'SHARED',
      active: true,
      technicianId: null,
    });

    await router.push('/');
    expect(router.currentRoute.value.name).toBe('work-order');
  });

  it('blocks shared technician from accessing administrative routes and redirects to /work-order', async () => {
    const session = useSessionStore();
    session.acceptSession('test-token', {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Shared Tech',
      email: 'shared@example.com',
      role: 'TECHNICIAN',
      orderAccessMode: 'SHARED',
      active: true,
      technicianId: null,
    });

    await router.push('/orders');
    expect(router.currentRoute.value.name).toBe('work-order');

    await router.push('/sync');
    expect(router.currentRoute.value.name).toBe('work-order');

    await router.push('/technicians');
    expect(router.currentRoute.value.name).toBe('work-order');

    await router.push('/admin/users');
    expect(router.currentRoute.value.name).toBe('work-order');
  });

  it('allows shared technician to access /work-order and /orders/:id/execute', async () => {
    const session = useSessionStore();
    session.acceptSession('test-token', {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Shared Tech',
      email: 'shared@example.com',
      role: 'TECHNICIAN',
      orderAccessMode: 'SHARED',
      active: true,
      technicianId: null,
    });

    await router.push('/work-order');
    expect(router.currentRoute.value.name).toBe('work-order');

    await router.push('/orders/00000000-0000-4000-8000-000000000010/execute');
    expect(router.currentRoute.value.name).toBe('order-execution');
  });

  it('redirects non-shared user from /work-order to /', async () => {
    const session = useSessionStore();
    session.acceptSession('test-token', {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'ADMIN',
      orderAccessMode: 'INDIVIDUAL',
      active: true,
      technicianId: null,
    });

    await router.push('/work-order');
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('blocks an individual technician from the administrator management route', async () => {
    const session = useSessionStore();
    session.acceptSession('test-token', {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Technician',
      email: 'tech@example.com',
      role: 'TECHNICIAN',
      orderAccessMode: 'INDIVIDUAL',
      active: true,
      technicianId: '00000000-0000-4000-8000-000000000003',
    });

    await router.push('/admin/users');
    expect(router.currentRoute.value.name).toBe('home');
  });
});
