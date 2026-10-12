import type { Client, CreateClient, SaveClientEmail, UpdateClient } from '@puk/contracts';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { ClientCatalogPort } from '../../integrations/ports.js';
import { AppError } from '../../shared/errors.js';

const clientSelection = {
  id: true,
  clientSheetId: true,
  name: true,
  emails: { select: { id: true, email: true }, orderBy: { email: 'asc' as const } },
} satisfies Prisma.ClientSelect;

export class ClientsService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly catalog: ClientCatalogPort,
  ) {}

  public list(): Promise<Client[]> {
    return this.prisma.client.findMany({ orderBy: { name: 'asc' }, select: clientSelection });
  }

  public async get(id: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({ where: { id }, select: clientSelection });
    if (!client) throw clientNotFound();
    return client;
  }

  public async create(actorUserId: string, input: CreateClient): Promise<Client> {
    let catalog;
    try {
      catalog = await this.catalog.getClients({ forceFresh: true });
    } catch {
      throw new AppError(
        503,
        'CLIENT_CATALOG_UNAVAILABLE',
        'No se pudo verificar el cliente en Google Sheets. Intenta nuevamente.',
      );
    }
    const sheetId = input.clientSheetId.trim();
    if (!catalog.data.some((client) => client.id === sheetId)) {
      throw new AppError(
        400,
        'CLIENT_SHEET_ID_NOT_FOUND',
        'Selecciona un cliente existente en Google Sheets.',
      );
    }
    return this.mutate('CLIENT_ALREADY_EXISTS', async (tx) => {
      const client = await tx.client.create({
        data: { clientSheetId: sheetId, name: input.name.trim() },
        select: clientSelection,
      });
      await this.audit(tx, actorUserId, 'CLIENT_CREATED', client.id, null, client);
      return client;
    });
  }

  public update(actorUserId: string, id: string, input: UpdateClient): Promise<Client> {
    return this.mutate('CLIENT_ALREADY_EXISTS', async (tx) => {
      const before = await this.requireClient(tx, id);
      const client = await tx.client.update({
        where: { id },
        data: { name: input.name.trim() },
        select: clientSelection,
      });
      await this.audit(tx, actorUserId, 'CLIENT_UPDATED', id, before, client);
      return client;
    });
  }

  public addEmail(actorUserId: string, id: string, input: SaveClientEmail) {
    return this.mutate('CLIENT_EMAIL_ALREADY_EXISTS', async (tx) => {
      await this.requireClient(tx, id);
      const email = await tx.clientEmail.create({
        data: { clientId: id, email: normalizeEmail(input.email) },
        select: { id: true, email: true },
      });
      await this.audit(tx, actorUserId, 'CLIENT_EMAIL_CREATED', email.id, null, {
        clientId: id,
        ...email,
      });
      return email;
    });
  }

  public updateEmail(actorUserId: string, id: string, emailId: string, input: SaveClientEmail) {
    return this.mutate('CLIENT_EMAIL_ALREADY_EXISTS', async (tx) => {
      await this.requireClient(tx, id);
      const before = await this.requireEmail(tx, id, emailId);
      const email = await tx.clientEmail.update({
        where: { id: emailId, clientId: id },
        data: { email: normalizeEmail(input.email) },
        select: { id: true, email: true },
      });
      await this.audit(
        tx,
        actorUserId,
        'CLIENT_EMAIL_UPDATED',
        emailId,
        { clientId: id, ...before },
        { clientId: id, ...email },
      );
      return email;
    });
  }

  public removeEmail(actorUserId: string, id: string, emailId: string) {
    return this.mutate('CLIENT_EMAIL_ALREADY_EXISTS', async (tx) => {
      await this.requireClient(tx, id);
      const before = await this.requireEmail(tx, id, emailId);
      await tx.clientEmail.delete({ where: { id: emailId, clientId: id } });
      await this.audit(
        tx,
        actorUserId,
        'CLIENT_EMAIL_DELETED',
        emailId,
        { clientId: id, ...before },
        null,
      );
      return { deleted: true };
    });
  }

  private async requireClient(tx: Prisma.TransactionClient, id: string) {
    const client = await tx.client.findUnique({ where: { id }, select: clientSelection });
    if (!client) throw clientNotFound();
    return client;
  }

  private async requireEmail(tx: Prisma.TransactionClient, clientId: string, id: string) {
    const email = await tx.clientEmail.findFirst({
      where: { id, clientId },
      select: { id: true, email: true },
    });
    if (!email)
      throw new AppError(404, 'CLIENT_EMAIL_NOT_FOUND', 'El correo no existe para este cliente.');
    return email;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    action: string,
    entityId: string,
    before: Prisma.InputJsonObject | null,
    after: Prisma.InputJsonObject | null,
  ) {
    await tx.auditLog.create({
      data: {
        action,
        actorUserId,
        entityId,
        entityType: action.startsWith('CLIENT_EMAIL_') ? 'ClientEmail' : 'Client',
        ...(before ? { before } : {}),
        ...(after ? { after } : {}),
      },
    });
  }

  private async mutate<T>(
    conflictCode: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'P2002')
        throw new AppError(
          409,
          conflictCode,
          conflictCode === 'CLIENT_ALREADY_EXISTS'
            ? 'El cliente ya está registrado.'
            : 'Este correo ya está registrado para el cliente.',
        );
      if (code === 'P2025')
        throw new AppError(404, 'CLIENT_RECORD_NOT_FOUND', 'El registro del cliente ya no existe.');
      throw error;
    }
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
function clientNotFound(): AppError {
  return new AppError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
}
