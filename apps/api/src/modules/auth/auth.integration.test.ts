import { randomUUID } from 'node:crypto';

import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '../../auth/password.js';
import { TokenService } from '../../auth/tokens.js';
import { createPrismaClient } from '../../database/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { UserRole } from '../../generated/prisma/enums.js';
import { AuthService } from './auth.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseTests = describe.runIf(databaseUrl?.includes('/puk_test'));

databaseTests('AuthService', () => {
  let prisma: PrismaClient;
  let service: AuthService;
  let userId: string;
  const email = `${randomUUID()}@example.invalid`;
  const password = 'integration-test-password';

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl!);
    const access = await generateKeyPair('EdDSA', { extractable: true });
    const refresh = await generateKeyPair('EdDSA', { extractable: true });
    const tokens = await TokenService.fromPem({
      accessPrivateKey: await exportPKCS8(access.privateKey),
      accessPublicKey: await exportSPKI(access.publicKey),
      accessTtl: '5m',
      audience: 'test-web',
      issuer: 'test-api',
      refreshPrivateKey: await exportPKCS8(refresh.privateKey),
      refreshPublicKey: await exportSPKI(refresh.publicKey),
      refreshTtl: '1h',
    });
    service = new AuthService(prisma, tokens);
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Auth test',
        passwordHash: await hashPassword(password),
        role: UserRole.ADMIN,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('returns the same generic error for unknown users and wrong passwords', async () => {
    await expect(service.login({ email, password: 'wrong' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await expect(
      service.login({ email: 'missing@example.invalid', password }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rotates refresh tokens and revokes the user sessions when one is reused', async () => {
    const first = await service.login({ email, password });
    const second = await service.refresh(first.refreshToken, {});
    await expect(service.refresh(first.refreshToken, {})).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    await expect(service.refresh(second.refreshToken, {})).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    expect(await prisma.refreshSession.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it('revokes all current sessions', async () => {
    await service.login({ email, password });
    await service.login({ email, password });
    await service.logoutAll(userId);
    expect(await prisma.refreshSession.count({ where: { userId, revokedAt: null } })).toBe(0);
  });
});
