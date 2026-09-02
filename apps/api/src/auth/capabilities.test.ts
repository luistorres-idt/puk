import { describe, expect, it } from 'vitest';

import { hasCapability, ownsAssignedOrder } from './capabilities.js';

describe('authorization policies', () => {
  it('separates administrative and technician capabilities', () => {
    expect(hasCapability('ADMIN', 'users:manage')).toBe(true);
    expect(hasCapability('TECHNICIAN', 'users:manage')).toBe(false);
    expect(hasCapability('TECHNICIAN', 'orders:execute')).toBe(true);
  });

  it('checks contextual order ownership', () => {
    expect(ownsAssignedOrder('user-1', { technicianUserId: 'user-1' })).toBe(true);
    expect(ownsAssignedOrder('user-2', { technicianUserId: 'user-1' })).toBe(false);
  });
});
