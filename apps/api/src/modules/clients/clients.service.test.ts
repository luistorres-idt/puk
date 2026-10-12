import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ClientsService } from './clients.service.js';

const client = { id: 'client-1', clientSheetId: 'C1', name: 'Client', emails: [] };
function setup() {
  const tx = {
    client: {
      findUnique: vi.fn().mockResolvedValue(client),
      create: vi.fn().mockResolvedValue(client),
      update: vi.fn().mockResolvedValue({ ...client, name: 'Renamed' }),
      findMany: vi.fn().mockResolvedValue([client]),
    },
    clientEmail: {
      findFirst: vi.fn().mockResolvedValue({ id: 'email-1', email: 'a@example.com' }),
      create: vi.fn().mockResolvedValue({ id: 'email-1', email: 'a@example.com' }),
      update: vi.fn().mockResolvedValue({ id: 'email-1', email: 'b@example.com' }),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const catalog = {
    getClients: vi.fn().mockResolvedValue({
      data: [{ id: 'C1', name: 'Sheets name' }],
      fetchedAt: new Date().toISOString(),
    }),
  };
  return {
    tx,
    prisma,
    catalog,
    service: new ClientsService(prisma as unknown as PrismaClient, catalog),
  };
}
describe('ClientsService', () => {
  let context: ReturnType<typeof setup>;
  beforeEach(() => {
    context = setup();
  });
  it('verifies a fresh Sheets ID and persists display name independently', async () => {
    await context.service.create('actor', { clientSheetId: ' C1 ', name: ' Local name ' });
    expect(context.catalog.getClients).toHaveBeenCalledWith({ forceFresh: true });
    expect(context.tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { clientSheetId: 'C1', name: 'Local name' } }),
    );
    expect(context.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CLIENT_CREATED', actorUserId: 'actor' }),
      }),
    );
  });
  it('rejects unknown Sheets IDs before writes', async () => {
    await expect(
      context.service.create('actor', { clientSheetId: 'missing', name: 'Client' }),
    ).rejects.toMatchObject({ code: 'CLIENT_SHEET_ID_NOT_FOUND', status: 400 });
    expect(context.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('fails closed when the catalog is unavailable', async () => {
    context.catalog.getClients.mockRejectedValueOnce(new Error('offline'));
    await expect(
      context.service.create('actor', { clientSheetId: 'C1', name: 'Client' }),
    ).rejects.toMatchObject({ code: 'CLIENT_CATALOG_UNAVAILABLE', status: 503 });
    expect(context.tx.client.create).not.toHaveBeenCalled();
  });
  it('returns clients and missing-client errors', async () => {
    await expect(context.service.list()).resolves.toEqual([client]);
    await expect(context.service.get(client.id)).resolves.toEqual(client);
    context.tx.client.findUnique.mockResolvedValueOnce(null as never);
    await expect(context.service.get('missing')).rejects.toMatchObject({
      code: 'CLIENT_NOT_FOUND',
      status: 404,
    });
  });
  it('only updates local name and audits before/after in the transaction', async () => {
    await context.service.update('actor', client.id, { name: 'Renamed' });
    expect(context.tx.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Renamed' } }),
    );
    expect(context.catalog.getClients).not.toHaveBeenCalled();
    expect(context.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CLIENT_UPDATED',
          before: client,
          after: { ...client, name: 'Renamed' },
        }),
      }),
    );
  });
  it('normalizes emails and maps concurrent uniqueness errors', async () => {
    await context.service.addEmail('actor', client.id, { email: ' A@Example.com ' });
    expect(context.tx.clientEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { clientId: client.id, email: 'a@example.com' } }),
    );
    context.tx.clientEmail.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      context.service.addEmail('actor', client.id, { email: 'a@example.com' }),
    ).rejects.toMatchObject({ code: 'CLIENT_EMAIL_ALREADY_EXISTS', status: 409 });
    context.tx.client.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      context.service.create('actor', { clientSheetId: 'C1', name: 'Client' }),
    ).rejects.toMatchObject({ code: 'CLIENT_ALREADY_EXISTS', status: 409 });
  });
  it('scopes editing and deletion to the owning client', async () => {
    await context.service.updateEmail('actor', client.id, 'email-1', { email: ' B@Example.com ' });
    expect(context.tx.clientEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-1', clientId: client.id },
        data: { email: 'b@example.com' },
      }),
    );
    await context.service.removeEmail('actor', client.id, 'email-1');
    expect(context.tx.clientEmail.delete).toHaveBeenCalledWith({
      where: { id: 'email-1', clientId: client.id },
    });
    expect(context.tx.auditLog.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CLIENT_EMAIL_DELETED',
          entityType: 'ClientEmail',
        }),
      }),
    );
  });
  it.each(['updateEmail', 'removeEmail'] as const)(
    'rejects cross-client %s without writing',
    async (method) => {
      context.tx.clientEmail.findFirst.mockResolvedValueOnce(null as never);
      await expect(
        method === 'updateEmail'
          ? context.service.updateEmail('actor', client.id, 'foreign-email', {
              email: 'a@example.com',
            })
          : context.service.removeEmail('actor', client.id, 'foreign-email'),
      ).rejects.toMatchObject({ code: 'CLIENT_EMAIL_NOT_FOUND', status: 404 });
      expect(context.tx.clientEmail.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'foreign-email', clientId: client.id } }),
      );
      expect(context.tx.clientEmail.update).not.toHaveBeenCalled();
      expect(context.tx.clientEmail.delete).not.toHaveBeenCalled();
    },
  );
  it('propagates audit failure rather than reporting success', async () => {
    context.tx.auditLog.create.mockRejectedValueOnce(new Error('audit failed'));
    await expect(
      context.service.addEmail('actor', client.id, { email: 'a@example.com' }),
    ).rejects.toThrow('audit failed');
  });
});
