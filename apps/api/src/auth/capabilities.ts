export const capabilities = [
  'clients:manage',
  'users:manage',
  'technicians:manage',
  'orders:manage',
  'orders:execute',
  'catalogs:read',
  'sync:retry',
] as const;

export type Capability = (typeof capabilities)[number];
export type Role = 'ADMIN' | 'TECHNICIAN';

const roleCapabilities: Record<Role, ReadonlySet<Capability>> = {
  ADMIN: new Set([
    'clients:manage',
    'users:manage',
    'technicians:manage',
    'orders:manage',
    'catalogs:read',
    'sync:retry',
  ]),
  TECHNICIAN: new Set(['orders:execute', 'catalogs:read']),
};

export function hasCapability(role: Role, capability: Capability): boolean {
  return roleCapabilities[role].has(capability);
}

export function ownsAssignedOrder(
  userId: string,
  order: { technicianUserId: string | null },
): boolean {
  return order.technicianUserId === userId;
}
