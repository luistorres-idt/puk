import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ExecutionService, ALL_CHECKLIST_CATEGORIES } from './execution.service.js';
import { DevMockStorageClient } from '../../integrations/object-storage/dev-mock-storage.client.js';
import {
  EquipmentVerificationStatus,
  OrderStatus,
  type PrismaClient,
  UploadStatus,
} from '../../generated/prisma/client.js';

interface MockPrismaExecution {
  $transaction: ReturnType<typeof vi.fn>;
  order: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  orderUnit: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  orderEquipment: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  discrepancy: {
    create: ReturnType<typeof vi.fn>;
  };
  checklist: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  checklistItem: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  evidence: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  signature: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
}

describe('ExecutionService', () => {
  let mockPrisma: MockPrismaExecution;
  let storagePort: DevMockStorageClient;
  let service: ExecutionService;
  let enqueuedOperations: Array<Record<string, unknown>>;

  beforeEach(() => {
    storagePort = new DevMockStorageClient();
    enqueuedOperations = [];

    mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          order: {
            update: vi.fn(
              async ({
                where,
                data,
              }: {
                where: { id: string };
                data: Record<string, unknown>;
              }) => ({
                id: where.id,
                ...data,
              }),
            ),
          },
          orderUnit: {
            updateMany: vi.fn(),
            findMany: vi.fn().mockResolvedValue([{ id: 'unit-1' }]),
          },
          orderEquipment: {
            update: vi.fn(
              async ({
                where,
                data,
              }: {
                where: { id: string };
                data: Record<string, unknown>;
              }) => ({
                id: where.id,
                ...data,
              }),
            ),
            updateMany: vi.fn(),
          },
          discrepancy: {
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
              id: 'disc-1',
              ...data,
            })),
          },
          checklist: {
            findUnique: vi.fn(),
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
              id: 'cl-1',
              ...data,
            })),
          },
          checklistItem: {
            upsert: vi.fn(),
          },
          evidence: {
            update: vi.fn(
              async ({
                where,
                data,
              }: {
                where: { id: string };
                data: Record<string, unknown>;
              }) => ({
                id: where.id,
                ...data,
              }),
            ),
          },
          auditLog: {
            createMany: vi.fn(),
          },
          sheetSyncOperation: {
            createMany: vi.fn(({ data }: { data: Array<Record<string, unknown>> }) => {
              enqueuedOperations.push(...data);
            }),
          },
        };
        return callback(tx);
      }),
      order: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      orderUnit: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      orderEquipment: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      discrepancy: {
        create: vi.fn(),
      },
      checklist: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      checklistItem: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
      evidence: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      signature: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };

    service = new ExecutionService(mockPrisma as unknown as PrismaClient, storagePort);
  });

  it('starts an assigned order and updates status to IN_PROGRESS', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.ASSIGNED,
      technicianId: 'tech-1',
    });

    const result = await service.startOrder('admin-1', 'ADMIN', 'order-1');
    expect(result.status).toBe(OrderStatus.IN_PROGRESS);
  });

  it('verifies equipment match on a unit', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
    });
    mockPrisma.orderEquipment.findUnique.mockResolvedValue({
      id: 'eq-1',
      orderUnitId: 'unit-1',
      externalKey: 'EQ-001',
    });

    const result = await service.verifyEquipment('admin-1', 'ADMIN', 'order-1', 'unit-1', 'eq-1');
    expect(result.verificationStatus).toBe(EquipmentVerificationStatus.MATCHED);
  });

  it('reports a discrepancy on an equipment', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
    });
    mockPrisma.orderEquipment.findUnique.mockResolvedValue({
      id: 'eq-1',
      orderUnitId: 'unit-1',
      externalKey: 'EQ-001',
    });

    const result = await service.reportDiscrepancy(
      'admin-1',
      'ADMIN',
      'order-1',
      'unit-1',
      'eq-1',
      {
        type: 'IMEI',
        description: 'IMEI no coincide con la etiqueta física',
      },
    );
    expect(result.id).toBe('disc-1');
    expect(result.type).toBe('IMEI');
  });

  it('presigns and completes evidence upload with storage validation', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
    });
    mockPrisma.checklist.findUnique.mockResolvedValue({ id: 'cl-1' });
    mockPrisma.checklistItem.findUnique.mockResolvedValue({ id: 'cli-1' });
    mockPrisma.evidence.create.mockResolvedValue({
      id: 'ev-1',
      objectKey: 'evidence/order-1/unit-1/dashboard/sample.jpg',
      mimeType: 'image/jpeg',
      status: UploadStatus.PENDING,
    });

    const presigned = await service.presignEvidenceUpload(
      'admin-1',
      'ADMIN',
      'order-1',
      'unit-1',
      'DASHBOARD',
      {
        mimeType: 'image/jpeg',
        sizeBytes: 50000,
      },
    );
    expect(presigned.uploadUrl).toBeDefined();
    expect(presigned.evidenceId).toBe('ev-1');

    // Complete evidence
    mockPrisma.evidence.findUnique.mockResolvedValue({
      id: 'ev-1',
      objectKey: presigned.objectKey,
      mimeType: 'image/jpeg',
      checklistItem: {
        checklist: {
          orderUnit: {
            order: { id: 'order-1', technicianId: 'tech-1' },
          },
        },
      },
    });

    mockPrisma.evidence.update.mockResolvedValue({
      id: 'ev-1',
      status: UploadStatus.COMPLETED,
    });

    const completed = await service.completeEvidence('admin-1', 'ADMIN', 'ev-1', {
      width: 1920,
      height: 1080,
    });
    expect(completed.status).toBe(UploadStatus.COMPLETED);
  });

  it('blocks completing an incomplete order with missing requirements error', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
      units: [
        {
          id: 'unit-1',
          label: 'Unidad 01',
          equipment: [{ externalKey: 'EQ-001', verificationStatus: 'PENDING' }],
          checklist: null,
        },
      ],
      signature: null,
    });

    await expect(service.completeOrder('admin-1', 'ADMIN', 'order-1')).rejects.toMatchObject({
      code: 'ORDER_INCOMPLETE',
    });
  });

  it('requests the PDF report after completing an order', async () => {
    const requestGeneration = vi.fn().mockResolvedValue({ id: 'report-1' });
    const reportService = new ExecutionService(mockPrisma as unknown as PrismaClient, storagePort, {
      reportGeneration: { requestGeneration },
    });
    const checklistItems = ['DASHBOARD', 'WINDOWS', 'ACCESSORIES', 'TRIMS', 'BODYWORK'].map(
      (category, index) => ({
        category,
        condition: 'GOOD',
        evidence: index === 0 ? [{ id: 'ev-1' }, { id: 'ev-2' }, { id: 'ev-3' }] : [],
      }),
    );
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      folio: 'OS-001',
      serviceType: 'INSTALLATION',
      clientNameSnapshot: 'Cliente Demo',
      scheduledAt: new Date(),
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
      technician: { id: 'tech-1', name: 'Tecnico Demo', installationRate: 500, departureCost: 100 },
      units: [
        {
          id: 'unit-1',
          label: 'Unidad 01',
          makeModel: 'Freightliner Cascadia',
          year: 2025,
          serialNumber: 'SN-001',
          serviceType: 'INSTALLATION',
          equipment: [
            {
              id: 'eq-1',
              externalKey: 'EQ-001',
              sheetRowHint: 7,
              serviceStatusSnapshot: 'STOCK TECNICO',
              verificationStatus: 'MATCHED',
            },
          ],
          checklist: { items: checklistItems },
        },
      ],
      signature: { signerName: 'Cliente' },
    });

    const result = await reportService.completeOrder('admin-1', 'ADMIN', 'order-1');

    expect(result.status).toBe(OrderStatus.COMPLETED);
    expect(requestGeneration).toHaveBeenCalledWith('order-1', 'admin-1');
    expect(enqueuedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey: 'COMPLETE_ASSIGNMENT:order-1:eq-1:1',
          operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
          payload: {
            externalKey: 'EQ-001',
            row: 7,
            values: {
              J: 'Cliente Demo',
              K: 'INSTALADO',
              L: 'Unidad 01',
              M: 'Freightliner Cascadia',
              N: '2025',
              O: 'SN-001',
            },
          },
        }),
        expect.objectContaining({ operationType: 'SHEET_TECHNICAL_REPORT' }),
      ]),
    );
  });

  it('marks an appointment as failed with a reason and releases equipment', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      folio: 'OS-001',
      serviceType: 'FAILED_APPOINTMENT',
      clientNameSnapshot: 'Cliente Demo',
      scheduledAt: new Date(),
      status: OrderStatus.ASSIGNED,
      technicianId: 'tech-1',
      technician: {
        id: 'tech-1',
        name: 'Tecnico Demo',
        failedAppointmentRate: 200,
        departureCost: 100,
      },
      units: [],
    });

    const result = await service.failAppointment('admin-1', 'ADMIN', 'order-1', {
      failedReason: 'Cliente no se presentó en la dirección pactada',
    });
    expect(result.status).toBe(OrderStatus.FAILED_APPOINTMENT);
    expect(result.failedReason).toBe('Cliente no se presentó en la dirección pactada');
  });

  it('allows an administrator to request correction on a completed order', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      folio: 'OS-001',
      serviceType: 'INSTALLATION',
      clientNameSnapshot: 'Cliente Demo',
      scheduledAt: new Date(),
      status: OrderStatus.COMPLETED,
      generalNotes: 'Notas iniciales',
      technician: { id: 'tech-1', name: 'Tecnico Demo', installationRate: 500, departureCost: 100 },
      units: [],
    });

    const result = await service.requireCorrection('admin-1', 'order-1', {
      notes: 'Falta foto clara del tablero encendido',
    });
    expect(result.status).toBe(OrderStatus.REQUIRES_CORRECTION);
    expect(result.generalNotes).toContain('Corrección solicitada');
  });

  it('rejects non-admin users attempting to reopen completed order for correction', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.COMPLETED,
      technicianId: 'tech-1',
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-tech', role: 'TECHNICIAN' });

    await expect(
      service.requireCorrection('user-tech', 'order-1', { notes: 'Reopen please' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('completes order with 0.00 rate and returns warnings when technician lacks configured rate', async () => {
    const checklistItems = ALL_CHECKLIST_CATEGORIES.map((category) => ({
      category,
      condition: 'GOOD',
      evidence: [{ id: 'ev-1' }],
    }));

    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      serviceType: 'INSTALLATION',
      technicianId: 'tech-1',
      technician: { id: 'tech-1', name: 'Tecnico Demo', installationRate: null },
      units: [
        {
          id: 'unit-1',
          label: 'Unidad 01',
          serialNumber: 'SN-001',
          equipment: [{ externalKey: 'EQ-001', verificationStatus: 'MATCHED' }],
          checklist: { items: checklistItems },
        },
      ],
      signature: { signerName: 'Cliente' },
    });

    const result = await service.completeOrder('admin-1', 'ADMIN', 'order-1');
    expect(result.status).toBe(OrderStatus.COMPLETED);
    expect(result.pricingTotal?.toString()).toBe('0');
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('no tiene configurada una tarifa válida');
  });

  it('allows failing appointment with 0.00 pricing when technician rate is unconfigured', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      folio: 'OS-001',
      serviceType: 'FAILED_APPOINTMENT',
      clientNameSnapshot: 'Cliente Demo',
      scheduledAt: new Date(),
      status: OrderStatus.ASSIGNED,
      technicianId: 'tech-1',
      technician: { id: 'tech-1', name: 'Tecnico Demo', failedAppointmentRate: null },
      units: [],
    });

    const result = await service.failAppointment('admin-1', 'ADMIN', 'order-1', {
      failedReason: 'No se pudo contactar',
    });
    expect(result.status).toBe(OrderStatus.FAILED_APPOINTMENT);
  });

  describe('technician isolation and access restrictions', () => {
    it('blocks a technician from starting an order assigned to another technician', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.ASSIGNED,
        technicianId: 'tech-A',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        technicianId: 'tech-B',
      });

      await expect(
        service.startOrder('user-tech-b', 'TECHNICIAN', 'order-1'),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      });
    });

    it('blocks a technician from verifying equipment on another technician order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.IN_PROGRESS,
        technicianId: 'tech-A',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        technicianId: 'tech-B',
      });

      await expect(
        service.verifyEquipment('user-tech-b', 'TECHNICIAN', 'order-1', 'unit-1', 'eq-1'),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      });
    });

    it('blocks a technician from reporting discrepancies on another technician order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.IN_PROGRESS,
        technicianId: 'tech-A',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        technicianId: 'tech-B',
      });

      await expect(
        service.reportDiscrepancy('user-tech-b', 'TECHNICIAN', 'order-1', 'unit-1', 'eq-1', {
          type: 'IMEI',
          description: 'No match',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      });
    });

    it('blocks a technician from completing an order assigned to another technician', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.IN_PROGRESS,
        technicianId: 'tech-A',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        technicianId: 'tech-B',
      });

      await expect(
        service.completeOrder('user-tech-b', 'TECHNICIAN', 'order-1'),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      });
    });
  });
});
