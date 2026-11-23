import type { AdminUserListItem } from '@puk/contracts';
import { createUser, listUsers, updateUser } from '@/modules/user-management';

export type StaffRole = 'ADMIN' | 'BILLING';

export async function listAdmins(): Promise<AdminUserListItem[]> {
  return (await listUsers()).filter((user) => user.role === 'ADMIN');
}

export async function listStaffUsers(): Promise<AdminUserListItem[]> {
  return (await listUsers()).filter((user) => user.role === 'ADMIN' || user.role === 'BILLING');
}

export async function createAdmin(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AdminUserListItem> {
  return createUser({ ...input, role: 'ADMIN' });
}

export async function createStaffUser(input: {
  email: string;
  name: string;
  password: string;
  role: StaffRole;
}): Promise<AdminUserListItem> {
  return createUser(input);
}

export { updateUser as updateAdmin };
