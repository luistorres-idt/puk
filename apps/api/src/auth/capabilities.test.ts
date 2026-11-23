import { describe, expect, it } from 'vitest';

import { hasCapability, ownsAssignedOrder } from './capabilities.js';

describe('authorization policies', () => {
  it('separates administrative, billing, and technician capabilities', () => {
    expect(hasCapability('ADMIN', 'clients:manage')).toBe(true);
    expect(hasCapability('ADMIN', 'billing:manage')).toBe(true);
    expect(hasCapability('ADMIN', 'technical-reports:manage')).toBe(true);
    expect(hasCapability('TECHNICIAN', 'clients:manage')).toBe(false);
    expect(hasCapability('TECHNICIAN', 'billing:manage')).toBe(false);
    expect(hasCapability('TECHNICIAN', 'technical-reports:manage')).toBe(false);
    expect(hasCapability('ADMIN', 'users:manage')).toBe(true);
    expect(hasCapability('TECHNICIAN', 'users:manage')).toBe(false);
    expect(hasCapability('TECHNICIAN', 'orders:execute')).toBe(true);
    expect(hasCapability('BILLING', 'billing:manage')).toBe(true);
    expect(hasCapability('BILLING', 'technical-reports:manage')).toBe(true);
    expect(hasCapability('BILLING', 'clients:manage')).toBe(false);
    expect(hasCapability('BILLING', 'users:manage')).toBe(false);
    expect(hasCapability('BILLING', 'orders:manage')).toBe(false);
    expect(hasCapability('BILLING', 'orders:execute')).toBe(false);
  });

  it('checks contextual order ownership', () => {
    expect(ownsAssignedOrder('user-1', { technicianUserId: 'user-1' })).toBe(true);
    expect(ownsAssignedOrder('user-2', { technicianUserId: 'user-1' })).toBe(false);
  });
});
