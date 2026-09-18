import type { PrismaClient } from '../generated/prisma/client.js';
import type { Role } from './capabilities.js';

export interface ActivePrincipal {
  id: string;
  role: Role;
}

export interface PrincipalResolver {
  resolve(userId: string): Promise<ActivePrincipal | null>;
}

export class PrismaPrincipalResolver implements PrincipalResolver {
  public constructor(private readonly prisma: PrismaClient) {}

  public async resolve(userId: string): Promise<ActivePrincipal | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, active: true },
    });
    if (!user?.active) return null;
    return { id: user.id, role: user.role };
  }
}
