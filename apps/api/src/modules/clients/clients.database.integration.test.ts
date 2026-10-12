import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../database/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ClientsService } from './clients.service.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
function isIsolatedLocalDatabase(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
      parsed.pathname === '/puk_test'
    );
  } catch {
    return false;
  }
}
describe.runIf(isIsolatedLocalDatabase(databaseUrl))(
  'isolated PostgreSQL client recipients',
  () => {
    let prisma: PrismaClient;
    let service: ClientsService;
    let actor: string;
    const sheetId = `TEST-${randomUUID()}`;
    const secondSheetId = `TEST-${randomUUID()}`;
    let clientId: string;
    let secondClientId: string;
    let emailId: string;
    beforeAll(async () => {
      prisma = createPrismaClient(databaseUrl!);
      actor = (
        await prisma.user.create({
          data: {
            email: `${randomUUID()}@example.invalid`,
            name: 'Client integration',
            passwordHash: 'not-a-login-fixture',
            role: 'ADMIN',
          },
        })
      ).id;
      service = new ClientsService(prisma, {
        getClients: async () => ({
          data: [
            { id: sheetId, name: 'Sheets client' },
            { id: secondSheetId, name: 'Second client' },
          ],
          fetchedAt: new Date().toISOString(),
        }),
      });
    });
    afterAll(async () => {
      await prisma.client.deleteMany({
        where: { clientSheetId: { in: [sheetId, secondSheetId] } },
      });
      await prisma.auditLog.deleteMany({ where: { actorUserId: actor } });
      await prisma.user.delete({ where: { id: actor } });
      await prisma.$disconnect();
    });
    it('persists unique stable identities and local names', async () => {
      const client = await service.create(actor, { clientSheetId: sheetId, name: 'Local client' });
      clientId = client.id;
      secondClientId = (
        await service.create(actor, { clientSheetId: secondSheetId, name: 'Second' })
      ).id;
      await expect(
        service.create(actor, { clientSheetId: sheetId, name: 'Duplicate' }),
      ).rejects.toMatchObject({ status: 409, code: 'CLIENT_ALREADY_EXISTS' });
      expect(await service.update(actor, clientId, { name: 'Renamed' })).toMatchObject({
        clientSheetId: sheetId,
        name: 'Renamed',
      });
    });
    it('enforces normalized per-client uniqueness while allowing another client to share an email', async () => {
      emailId = (await service.addEmail(actor, clientId, { email: ' Recipient@Example.invalid ' }))
        .id;
      await expect(
        service.addEmail(actor, clientId, { email: 'recipient@example.invalid' }),
      ).rejects.toMatchObject({ status: 409, code: 'CLIENT_EMAIL_ALREADY_EXISTS' });
      await service.addEmail(actor, secondClientId, { email: 'recipient@example.invalid' });
      expect((await service.get(clientId)).emails).toEqual([
        { id: emailId, email: 'recipient@example.invalid' },
      ]);
    });
    it('rejects cross-client email edits/deletion and reports missing records', async () => {
      await expect(
        service.updateEmail(actor, secondClientId, emailId, { email: 'other@example.invalid' }),
      ).rejects.toMatchObject({ status: 404, code: 'CLIENT_EMAIL_NOT_FOUND' });
      await expect(service.removeEmail(actor, secondClientId, emailId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(service.get(randomUUID())).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
      await expect(
        service.addEmail(actor, randomUUID(), { email: 'a@example.invalid' }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it('updates/deletes recipients and audits successful mutations only', async () => {
      await service.updateEmail(actor, clientId, emailId, { email: ' Updated@Example.invalid ' });
      expect((await service.get(clientId)).emails[0]?.email).toBe('updated@example.invalid');
      await service.removeEmail(actor, clientId, emailId);
      expect((await service.get(clientId)).emails).toEqual([]);
      const logs = await prisma.auditLog.findMany({ where: { actorUserId: actor } });
      expect(logs).toHaveLength(7);
      expect(logs.map((log) => log.action)).toEqual(
        expect.arrayContaining([
          'CLIENT_CREATED',
          'CLIENT_UPDATED',
          'CLIENT_EMAIL_CREATED',
          'CLIENT_EMAIL_UPDATED',
          'CLIENT_EMAIL_DELETED',
        ]),
      );
    });
    it('rolls back recipient persistence if the audit actor is invalid', async () => {
      await expect(
        service.addEmail(randomUUID(), clientId, { email: 'rolled-back@example.invalid' }),
      ).rejects.toThrow();
      expect(
        await prisma.clientEmail.count({
          where: { clientId, email: 'rolled-back@example.invalid' },
        }),
      ).toBe(0);
    });
  },
);
