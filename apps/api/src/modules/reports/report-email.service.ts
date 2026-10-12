import { randomUUID } from 'node:crypto';
import type { ReportEmailRecipients, ReportEmailResult, SendReportEmail } from '@puk/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ReportMailPort } from '../../integrations/gmail/gmail.client.js';
import { AppError } from '../../shared/errors.js';
import type { ReportsService } from './reports.service.js';

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
type Actor = { userId: string; role: 'ADMIN' | 'TECHNICIAN' };

export class ReportEmailService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly reports: Pick<ReportsService, 'readReadyPdfForDelivery'>,
    private readonly sender?: ReportMailPort,
  ) {}

  public async recipients(orderId: string, actor: Actor): Promise<ReportEmailRecipients> {
    const order = await this.requireOrder(orderId, actor);
    const client = await this.prisma.client.findUnique({
      where: { clientSheetId: order.clientSheetId },
      select: {
        id: true,
        clientSheetId: true,
        name: true,
        emails: { select: { id: true, email: true }, orderBy: { email: 'asc' } },
      },
    });
    return { client, configured: this.sender !== undefined };
  }

  public async send(
    orderId: string,
    actor: Actor,
    input: SendReportEmail,
  ): Promise<ReportEmailResult> {
    if (actor.role !== 'ADMIN')
      throw new AppError(403, 'FORBIDDEN', 'Solo un administrador puede enviar reportes.');
    if (!this.sender)
      throw new AppError(
        503,
        'REPORT_EMAIL_UNAVAILABLE',
        'El envío por Gmail no está configurado.',
      );
    const order = await this.requireOrder(orderId, actor);
    if (
      !input.recipientIds.length ||
      input.recipientIds.length > 20 ||
      new Set(input.recipientIds).size !== input.recipientIds.length
    ) {
      throw new AppError(
        400,
        'INVALID_REPORT_RECIPIENTS',
        'Selecciona entre uno y veinte correos distintos del cliente.',
      );
    }
    const { client } = await this.recipients(orderId, actor);
    if (!client)
      throw new AppError(
        409,
        'REPORT_CLIENT_NOT_REGISTERED',
        'Registra al cliente y sus correos antes de enviar el reporte.',
      );
    const selected = input.recipientIds.map((id) => client.emails.find((email) => email.id === id));
    if (selected.some((recipient) => !recipient))
      throw new AppError(
        400,
        'INVALID_REPORT_RECIPIENTS',
        'Los correos seleccionados deben pertenecer al cliente de la orden.',
      );
    const pdf = await this.reports.readReadyPdfForDelivery(orderId, input.reportId);
    if (pdf.bytes.byteLength > MAX_ATTACHMENT_BYTES)
      throw new AppError(
        413,
        'REPORT_EMAIL_TOO_LARGE',
        'El PDF supera el límite de envío de 20 MiB.',
      );
    const attemptId = randomUUID();
    const results: ReportEmailResult['results'] = [];
    for (const recipient of selected) {
      const snapshot = recipient!;
      const auditContext = {
        attemptId,
        reportId: pdf.reportId,
        version: pdf.version,
        recipientId: snapshot.id,
        email: snapshot.email,
      };
      // Persist the intent before the external side effect. Never auto-retry a send.
      await this.prisma.auditLog.create({
        data: {
          action: 'SERVICE_ORDER_REPORT_EMAIL_ATTEMPTED',
          actorUserId: actor.userId,
          entityType: 'Order',
          entityId: orderId,
          after: auditContext,
        },
      });
      let result: ReportEmailResult['results'][number];
      try {
        const delivered = await this.sender.send({
          recipient: snapshot.email,
          subject: `Reporte de orden de servicio ${order.folio} - versión ${pdf.version}`,
          text: `Adjuntamos el reporte PDF de la orden de servicio ${order.folio}, versión ${pdf.version}.`,
          fileName: pdf.fileName,
          pdf: pdf.bytes,
        });
        result = {
          recipientId: snapshot.id,
          email: snapshot.email,
          status: 'SENT',
          messageId: delivered.messageId,
        };
      } catch {
        // Provider errors can include credentials/raw MIME. Never log or expose them.
        result = {
          recipientId: snapshot.id,
          email: snapshot.email,
          status: 'FAILED',
          failureCode: 'DELIVERY_UNCONFIRMED',
        };
      }
      await this.prisma.auditLog.create({
        data: {
          action:
            result.status === 'SENT'
              ? 'SERVICE_ORDER_REPORT_EMAIL_SENT'
              : 'SERVICE_ORDER_REPORT_EMAIL_FAILED',
          actorUserId: actor.userId,
          entityType: 'Order',
          entityId: orderId,
          after: {
            ...auditContext,
            status: result.status,
            ...(result.messageId ? { messageId: result.messageId } : {}),
            ...(result.failureCode ? { failureCode: result.failureCode } : {}),
          },
        },
      });
      results.push(result);
    }
    const sent = results.filter((result) => result.status === 'SENT').length;
    return {
      reportId: pdf.reportId,
      version: pdf.version,
      attemptId,
      status: sent === results.length ? 'SUCCESS' : sent === 0 ? 'FAILURE' : 'PARTIAL_FAILURE',
      results,
    };
  }

  private async requireOrder(id: string, actor: Actor) {
    if (actor.role !== 'ADMIN')
      throw new AppError(
        403,
        'FORBIDDEN',
        'Solo un administrador puede administrar los destinatarios del reporte.',
      );
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true, clientSheetId: true, folio: true },
    });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'La orden no existe.');
    if (order.status !== 'COMPLETED')
      throw new AppError(
        409,
        'ORDER_NOT_COMPLETED',
        'Solo se pueden enviar reportes de órdenes completadas.',
      );
    return order;
  }
}
