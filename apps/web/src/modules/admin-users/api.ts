import type { AdminUserListItem } from '@puk/contracts';
import { createUser, listUsers, updateUser } from '@/modules/user-management';

export async function listAdmins(): Promise<AdminUserListItem[]> {
  return (await listUsers()).filter((user) => user.role === 'ADMIN');
}

export async function createAdmin(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AdminUserListItem> {
  return createUser({ ...input, role: 'ADMIN' });
}

export { updateUser as updateAdmin };
