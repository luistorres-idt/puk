import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ReportMailPort } from '../../integrations/gmail/gmail.client.js';
import type { TechnicalReportSyncScheduleService } from '../orders/index.js';
import { TechnicianReportEmailService } from './technician-report-email.service.js';

describe('TechnicianReportEmailService', () => {
  let mockPrisma: {
    order: { findMany: ReturnType<typeof vi.fn> };
    auditLog: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  };
  let mockSchedule: {
    getConfig: ReturnType<typeof vi.fn>;
  };
  let mockSender: ReportMailPort;

  const validConfig = {
    adminRecipientEmail: 'admin.ops@company.com',
    cutoffWeekday: 2,
    syncWeekday: 3,
    syncTime: '17:00',
    timeZone: 'America/Hermosillo',
  };

  beforeEach(() => {
    mockPrisma = {
      order: {
        findMany: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    mockSchedule = {
      getConfig: vi.fn().mockResolvedValue(validConfig),
    };

    mockSender = {
      send: vi.fn().mockResolvedValue({ messageId: 'msg-abc-123' }),
    };
  });

  it('skips processing if email sender is not configured', async () => {
    const service = new TechnicianReportEmailService(
      mockPrisma as unknown as PrismaClient,
      mockSchedule as unknown as TechnicalReportSyncScheduleService,
      undefined,
    );

    const result = await service.dispatchWeeklyReports('admin-user');
    expect(result.status).toBe('SKIPPED');
    expect(result.reason).toBe('EMAIL_SENDER_NOT_CONFIGURED');
    expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
  });

  it('skips processing if adminRecipientEmail is not configured in schedule', async () => {
    mockSchedule.getConfig.mockResolvedValueOnce({
      ...validConfig,
      adminRecipientEmail: null,
    });

    const service = new TechnicianReportEmailService(
      mockPrisma as unknown as PrismaClient,
      mockSchedule as unknown as TechnicalReportSyncScheduleService,
      mockSender,
    );

    const result = await service.dispatchWeeklyReports('admin-user');
    expect(result.status).toBe('SKIPPED');
    expect(result.reason).toBe('ADMIN_RECIPIENT_EMAIL_NOT_CONFIGURED');
    expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
  });

  it('returns NO_ORDERS when no completed orders match the window', async () => {
    mockPrisma.order.findMany.mockResolvedValueOnce([]);

    const service = new TechnicianReportEmailService(
      mockPrisma as unknown as PrismaClient,
      mockSchedule as unknown as TechnicalReportSyncScheduleService,
      mockSender,
    );

    const result = await service.dispatchWeeklyReports('admin-user');
    expect(result.status).toBe('NO_ORDERS');
    expect(result.sentCount).toBe(0);
    expect(result.recipient).toBe('admin.ops@company.com');
    expect(mockSender.send).not.toHaveBeenCalled();
  });

  it('groups orders by technician, dispatches individual Excel emails to admin, and records audits', async () => {
    const orders = [
      {
        id: 'ord-1',
        folio: 'ORD-101',
        technicianId: 'tech-1',
        technician: { id: 'tech-1', name: 'Juan Pérez', externalKey: 'TK-1' },
        scheduledAt: new Date('2026-09-08T14:00:00.000Z'),
        clientNameSnapshot: 'Cliente Alpha',
        serviceType: 'INSTALLATION',
        status: 'COMPLETED',
        pricingBaseCost: '500.00',
        pricingTravelExpenses: '100.00',
        pricingTotal: '600.00',
        units: [],
      },
      {
        id: 'ord-2',
        folio: 'ORD-102',
        technicianId: 'tech-1',
        technician: { id: 'tech-1', name: 'Juan Pérez', externalKey: 'TK-1' },
        scheduledAt: new Date('2026-09-08T16:00:00.000Z'),
        clientNameSnapshot: 'Cliente Beta',
        serviceType: 'REVIEW',
        status: 'COMPLETED',
        pricingBaseCost: '300.00',
        pricingTravelExpenses: '0.00',
        pricingTotal: '300.00',
        units: [],
      },
      {
        id: 'ord-3',
        folio: 'ORD-201',
        technicianId: 'tech-2',
        technician: { id: 'tech-2', name: 'Pedro López', externalKey: 'TK-2' },
        scheduledAt: new Date('2026-09-08T15:00:00.000Z'),
        clientNameSnapshot: 'Cliente Gamma',
        serviceType: 'UNINSTALLATION',
        status: 'COMPLETED',
        pricingBaseCost: '400.00',
        pricingTravelExpenses: '50.00',
        pricingTotal: '450.00',
        units: [],
      },
    ];

    mockPrisma.order.findMany.mockResolvedValueOnce(orders);

    const service = new TechnicianReportEmailService(
      mockPrisma as unknown as PrismaClient,
      mockSchedule as unknown as TechnicalReportSyncScheduleService,
      mockSender,
    );

    const result = await service.dispatchWeeklyReports('admin-user', {
      referenceDate: new Date('2026-09-09T17:00:00.000Z'),
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.sentCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.results).toHaveLength(2);

    // Verify 2 emails sent to admin recipient
    expect(mockSender.send).toHaveBeenCalledTimes(2);

    const call1 = vi.mocked(mockSender.send).mock.calls[0]![0];
    expect(call1.recipient).toBe('admin.ops@company.com');
    expect(call1.subject).toContain('Juan Pérez');
    expect(call1.subject).toContain('(2 órdenes)');
    expect(call1.attachment?.fileName).toMatch(/Reporte_Juan_Perez_Semana_\d+\.xlsx/);
    expect(call1.attachment?.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(call1.attachment?.content).toBeInstanceOf(Uint8Array);

    const call2 = vi.mocked(mockSender.send).mock.calls[1]![0];
    expect(call2.recipient).toBe('admin.ops@company.com');
    expect(call2.subject).toContain('Pedro López');
    expect(call2.subject).toContain('(1 órdenes)');

    // Verify audit logs (2 attempts + 2 sents)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(4);
  });

  it('isolates failures: when sending fails for one technician, continues with remaining technicians', async () => {
    const orders = [
      {
        id: 'ord-1',
        folio: 'ORD-101',
        technicianId: 'tech-1',
        technician: { id: 'tech-1', name: 'Juan Pérez' },
        scheduledAt: new Date('2026-09-08T14:00:00.000Z'),
        clientNameSnapshot: 'Cliente Alpha',
        serviceType: 'INSTALLATION',
        status: 'COMPLETED',
        pricingBaseCost: '500.00',
        pricingTravelExpenses: '0.00',
        pricingTotal: '500.00',
        units: [],
      },
      {
        id: 'ord-2',
        folio: 'ORD-201',
        technicianId: 'tech-2',
        technician: { id: 'tech-2', name: 'Pedro López' },
        scheduledAt: new Date('2026-09-08T15:00:00.000Z'),
        clientNameSnapshot: 'Cliente Gamma',
        serviceType: 'REVIEW',
        status: 'COMPLETED',
        pricingBaseCost: '300.00',
        pricingTravelExpenses: '0.00',
        pricingTotal: '300.00',
        units: [],
      },
    ];

    mockPrisma.order.findMany.mockResolvedValueOnce(orders);

    // Fail first call, succeed second
    vi.mocked(mockSender.send)
      .mockRejectedValueOnce(new Error('Gmail timeout'))
      .mockResolvedValueOnce({ messageId: 'msg-success-2' });

    const service = new TechnicianReportEmailService(
      mockPrisma as unknown as PrismaClient,
      mockSchedule as unknown as TechnicalReportSyncScheduleService,
      mockSender,
    );

    const result = await service.dispatchWeeklyReports('admin-user');

    expect(result.status).toBe('PARTIAL_FAILURE');
    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(1);

    expect(result.results[0]).toMatchObject({
      technicianId: 'tech-1',
      status: 'FAILED',
      failureCode: 'DELIVERY_UNCONFIRMED',
    });
    expect(result.results[1]).toMatchObject({
      technicianId: 'tech-2',
      status: 'SENT',
      messageId: 'msg-success-2',
    });
  });

  it('dispatches consolidated report in parallel when consolidatedRecipientEmail is configured', async () => {
    mockSchedule.getConfig.mockResolvedValueOnce({
      ...validConfig,
      consolidatedRecipientEmail: 'consolidated@company.com',
    });

    const orders = [
      {
        id: 'ord-1',
        folio: 'ORD-101',
        technicianId: 'tech-1',
        technician: { id: 'tech-1', name: 'Juan Pérez', externalKey: 'TK-1' },
        scheduledAt: new Date('2026-09-08T14:00:00.000Z'),
        clientNameSnapshot: 'Cliente Alpha',
        serviceType: 'INSTALLATION',
        status: 'COMPLETED',
        pricingBaseCost: '500.00',
        pricingTravelExpenses: '100.00',
        pricingTotal: '600.00',
        units: [],
      },
    ];

    mockPrisma.order.findMany.mockResolvedValueOnce(orders);

    const service = new TechnicianReportEmailService(
      mockPrisma as unknown as PrismaClient,
      mockSchedule as unknown as TechnicalReportSyncScheduleService,
      mockSender,
    );

    const result = await service.dispatchWeeklyReports('admin-user');

    expect(result.status).toBe('SUCCESS');
    expect(result.sentCount).toBe(2); // 1 technician + 1 consolidated
    expect(result.failedCount).toBe(0);
    expect(result.consolidatedRecipient).toBe('consolidated@company.com');
    expect(result.consolidatedSent).toBe(true);

    // Verify 2 emails sent: one to admin, one to consolidated
    expect(mockSender.send).toHaveBeenCalledTimes(2);
    expect(mockSender.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        recipient: 'admin.ops@company.com',
        subject: expect.stringContaining('Juan Pérez'),
      }),
    );
    expect(mockSender.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        recipient: 'consolidated@company.com',
        subject: expect.stringContaining('Reporte técnico consolidado'),
      }),
    );

    // Verify consolidated audit logs
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CONSOLIDATED_REPORT_EMAIL_SENT',
          entityType: 'TechnicalReportSyncSchedule',
        }),
      }),
    );
  });

  it('dispatches only consolidated report when adminRecipientEmail is null but consolidatedRecipientEmail is set', async () => {
    mockSchedule.getConfig.mockResolvedValueOnce({
      ...validConfig,
      adminRecipientEmail: null,
      consolidatedRecipientEmail: 'consolidated@company.com',
    });

    const orders = [
      {
        id: 'ord-1',
        folio: 'ORD-101',
        technicianId: 'tech-1',
        technician: { id: 'tech-1', name: 'Juan Pérez', externalKey: 'TK-1' },
        scheduledAt: new Date('2026-09-08T14:00:00.000Z'),
        clientNameSnapshot: 'Cliente Alpha',
        serviceType: 'INSTALLATION',
        status: 'COMPLETED',
        pricingBaseCost: '500.00',
        pricingTravelExpenses: '100.00',
        pricingTotal: '600.00',
        units: [],
      },
    ];

    mockPrisma.order.findMany.mockResolvedValueOnce(orders);

    const service = new TechnicianReportEmailService(
      mockPrisma as unknown as PrismaClient,
      mockSchedule as unknown as TechnicalReportSyncScheduleService,
      mockSender,
    );

    const result = await service.dispatchWeeklyReports('admin-user');

    expect(result.status).toBe('SUCCESS');
    expect(result.sentCount).toBe(1); // 0 tech + 1 consolidated
    expect(result.results).toHaveLength(0);
    expect(mockSender.send).toHaveBeenCalledTimes(1);
    expect(mockSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'consolidated@company.com',
      }),
    );
  });

  describe('processScheduledDispatch', () => {
    it('returns null if sender is undefined', async () => {
      const service = new TechnicianReportEmailService(
        mockPrisma as unknown as PrismaClient,
        mockSchedule as unknown as TechnicalReportSyncScheduleService,
        undefined,
      );

      const result = await service.processScheduledDispatch();
      expect(result).toBeNull();
    });

    it('returns null if adminRecipientEmail is not configured', async () => {
      mockSchedule.getConfig.mockResolvedValueOnce({
        ...validConfig,
        adminRecipientEmail: null,
      });

      const service = new TechnicianReportEmailService(
        mockPrisma as unknown as PrismaClient,
        mockSchedule as unknown as TechnicalReportSyncScheduleService,
        mockSender,
      );

      const result = await service.processScheduledDispatch();
      expect(result).toBeNull();
    });

    it('returns null if reference time is before the scheduled sync time', async () => {
      const service = new TechnicianReportEmailService(
        mockPrisma as unknown as PrismaClient,
        mockSchedule as unknown as TechnicalReportSyncScheduleService,
        mockSender,
      );

      // Wednesday at 10:00 (cutoff ended Tuesday 23:59:59, next sync is Wednesday 17:00)
      const earlyReference = new Date('2026-10-28T10:00:00-07:00');
      const result = await service.processScheduledDispatch(earlyReference);
      expect(result).toBeNull();
      expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
    });

    it('returns null if batch has already been processed for this cutoff window', async () => {
      mockPrisma.auditLog.findFirst.mockResolvedValueOnce({ id: 'existing-batch-audit' });

      const service = new TechnicianReportEmailService(
        mockPrisma as unknown as PrismaClient,
        mockSchedule as unknown as TechnicalReportSyncScheduleService,
        mockSender,
      );

      // Wednesday at 17:30 (past sync time)
      const syncTimeReference = new Date('2026-10-28T17:30:00-07:00');
      const result = await service.processScheduledDispatch(syncTimeReference);
      expect(result).toBeNull();
      expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith({
        where: {
          action: 'TECHNICIAN_REPORT_EMAIL_BATCH_PROCESSED',
          entityType: 'TechnicalReportSyncSchedule',
          entityId: expect.stringMatching(/^batch-/),
        },
      });
      expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
    });

    it('claims batch and dispatches reports when sync time is reached and batch is pending', async () => {
      mockPrisma.order.findMany.mockResolvedValueOnce([]);

      const service = new TechnicianReportEmailService(
        mockPrisma as unknown as PrismaClient,
        mockSchedule as unknown as TechnicalReportSyncScheduleService,
        mockSender,
      );

      // Wednesday at 17:30 (past sync time)
      const syncTimeReference = new Date('2026-10-28T17:30:00-07:00');
      const result = await service.processScheduledDispatch(syncTimeReference);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'TECHNICIAN_REPORT_EMAIL_BATCH_PROCESSED',
          entityType: 'TechnicalReportSyncSchedule',
          entityId: expect.stringMatching(/^batch-/),
          after: expect.objectContaining({
            adminRecipient: 'admin.ops@company.com',
          }),
        },
      });
      expect(result).toMatchObject({
        status: 'NO_ORDERS',
        sentCount: 0,
        failedCount: 0,
      });
    });
  });
});
