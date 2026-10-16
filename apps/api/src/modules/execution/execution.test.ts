import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MIN_REQUIRED_EVIDENCE_PHOTOS } from '@puk/contracts';
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

function completeOrderFixture() {
  const checklistItems = ['DASHBOARD', 'WINDOWS', 'ACCESSORIES', 'TRIMS', 'BODYWORK'].map(
    (category) => ({ category, condition: 'GOOD' }),
  );
  return {
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
        evidence: Array.from({ length: MIN_REQUIRED_EVIDENCE_PHOTOS }, (_, evidenceIndex) => ({
          id: `ev-${evidenceIndex + 1}`,
          status: UploadStatus.COMPLETED,
        })),
        checklist: { items: checklistItems },
      },
    ],
    signature: { signerName: 'Cliente' },
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
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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

  it('updates execution notes for an order in progress', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
      generalNotes: 'Notas iniciales',
    });

    const result = await service.updateExecutionNotes('admin-1', 'ADMIN', 'order-1', {
      notes: 'Servicio realizado sin incidencias',
    });

    expect(result.generalNotes).toBe('Servicio realizado sin incidencias');
  });

  it('verifies equipment match on a unit', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
    });
    mockPrisma.orderUnit.findUnique.mockResolvedValue({ id: 'unit-1', orderId: 'order-1' });
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
    mockPrisma.orderUnit.findUnique.mockResolvedValue({ id: 'unit-1', orderId: 'order-1' });
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
    mockPrisma.orderUnit.findUnique.mockResolvedValue({ id: 'unit-1', orderId: 'order-1' });
    mockPrisma.checklist.findUnique.mockResolvedValue({ id: 'cl-1' });
    mockPrisma.checklistItem.findUnique.mockResolvedValue({ id: 'cli-1' });
    mockPrisma.evidence.create.mockResolvedValue({
      id: 'ev-1',
      objectKey: 'evidence/order-1/unit-1/dashboard/sample.jpg',
      mimeType: 'image/png',
      status: UploadStatus.PENDING,
    });

    const presigned = await service.presignEvidenceUpload('admin-1', 'ADMIN', 'order-1', 'unit-1', {
      mimeType: 'image/png',
      sizeBytes: 50000,
    });
    expect(presigned.uploadUrl).toBeDefined();
    expect(presigned.evidenceId).toBe('ev-1');
    expect(mockPrisma.evidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderUnitId: 'unit-1' }),
    });
    expect(mockPrisma.evidence.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      'checklistItemId',
    );
    expect(mockPrisma.checklistItem.findUnique).not.toHaveBeenCalled();

    // Complete evidence
    mockPrisma.evidence.findUnique.mockResolvedValue({
      id: 'ev-1',
      objectKey: presigned.objectKey,
      mimeType: 'image/png',
      orderUnit: { order: { id: 'order-1', technicianId: 'tech-1' } },
    });

    mockPrisma.evidence.update.mockResolvedValue({
      id: 'ev-1',
      status: UploadStatus.COMPLETED,
    });

    await expect(
      service.completeEvidence('admin-1', 'ADMIN', 'ev-1', { width: 1920, height: 1080 }),
    ).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_MISMATCH' });
    expect(mockPrisma.evidence.update).not.toHaveBeenCalled();

    const completed = await service.completeEvidence('admin-1', 'ADMIN', 'ev-1', {
      width: 1,
      height: 1,
    });
    expect(completed.status).toBe(UploadStatus.COMPLETED);
    expect(mockPrisma.evidence.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: expect.objectContaining({ width: 1, height: 1, sizeBytes: expect.any(Number) }),
    });
  });

  it('rejects oversized legacy evidence before completion writes', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', technicianId: 'tech-1' });
    mockPrisma.evidence.findUnique.mockResolvedValue({
      id: 'ev-large',
      objectKey: 'large-object',
      mimeType: 'image/png',
      orderUnit: { order: { id: 'order-1', technicianId: 'tech-1' } },
    });
    await storagePort.putObject('large-object', new Uint8Array([1, 2, 3, 4, 5]), 'image/png');
    service = new ExecutionService(mockPrisma as unknown as PrismaClient, storagePort, {
      maxEvidenceBytes: 4,
    });

    await expect(
      service.completeEvidence('admin-1', 'ADMIN', 'ev-large', {}),
    ).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
    expect(mockPrisma.evidence.update).not.toHaveBeenCalled();
  });

  it('rejects evidence whose stored MIME type conflicts with its image content', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', technicianId: 'tech-1' });
    mockPrisma.evidence.findUnique.mockResolvedValue({
      id: 'ev-mime',
      objectKey: 'wrong-mime',
      mimeType: 'image/jpeg',
      orderUnit: { order: { id: 'order-1', technicianId: 'tech-1' } },
    });
    await storagePort.putObject(
      'wrong-mime',
      Uint8Array.from(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      ),
      'image/jpeg',
    );

    await expect(service.completeEvidence('admin-1', 'ADMIN', 'ev-mime', {})).rejects.toMatchObject(
      {
        code: 'INVALID_IMAGE',
      },
    );
    expect(mockPrisma.evidence.update).not.toHaveBeenCalled();
  });

  it('rejects presigning evidence for a unit belonging to another order', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
    });
    mockPrisma.orderUnit.findUnique.mockResolvedValue({ id: 'unit-1', orderId: 'order-2' });
    await expect(
      service.presignEvidenceUpload('admin-1', 'ADMIN', 'order-1', 'unit-1', {
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'UNIT_NOT_FOUND' });
    expect(mockPrisma.evidence.create).not.toHaveBeenCalled();
  });

  it('presigns, confirms, and reads a signature through legacy storage', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
    });
    const presigned = await service.presignSignatureUpload('admin-1', 'ADMIN', 'order-1', {
      sizeBytes: 100,
    });
    expect(presigned.objectKey).toMatch(/^signatures\/order-1\/.*\.png$/);
    expect(presigned.uploadUrl).toContain('mock-upload');

    mockPrisma.signature.upsert.mockResolvedValue({
      orderId: 'order-1',
      objectKey: presigned.objectKey,
      signerName: 'Client One',
    });
    const completed = await service.completeSignature(
      'admin-1',
      'ADMIN',
      'order-1',
      { signerName: 'Client One' },
      presigned.objectKey,
    );
    expect(completed.objectKey).toBe(presigned.objectKey);
    expect(mockPrisma.signature.upsert).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      create: expect.objectContaining({ objectKey: presigned.objectKey, mimeType: 'image/png' }),
      update: expect.objectContaining({ objectKey: presigned.objectKey, mimeType: 'image/png' }),
    });

    mockPrisma.signature.findUnique.mockResolvedValue(completed);
    await expect(service.getSignatureUrl('admin-1', 'ADMIN', 'order-1')).resolves.toEqual({
      downloadUrl: expect.stringContaining('mock-download'),
      signerName: 'Client One',
    });
  });

  it('does not save a legacy signature if its uploaded object is missing', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', technicianId: 'tech-1' });
    await expect(
      service.completeSignature(
        'admin-1',
        'ADMIN',
        'order-1',
        { signerName: 'Client One' },
        'missing',
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND' });
    expect(mockPrisma.signature.upsert).not.toHaveBeenCalled();
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
    const scheduledFor = new Date('2026-09-10T00:00:00.000Z');
    const reportService = new ExecutionService(mockPrisma as unknown as PrismaClient, storagePort, {
      reportGeneration: { requestGeneration },
      technicalReportScheduling: {
        getNextScheduledAt: vi.fn().mockResolvedValue(scheduledFor),
      },
    });
    mockPrisma.order.findUnique.mockResolvedValue(completeOrderFixture());

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
        expect.objectContaining({
          nextAttemptAt: scheduledFor,
          operationType: 'SHEET_TECHNICAL_REPORT',
          scheduledFor,
        }),
      ]),
    );
  });

  it('keeps an order completed when PDF queueing fails after the transaction', async () => {
    let outboxExistsBeforeGeneration = false;
    const requestGeneration = vi.fn(async () => {
      outboxExistsBeforeGeneration = enqueuedOperations.some(
        (operation) =>
          operation.idempotencyKey === 'REPORT:order-1:1' &&
          operation.operationType === 'SHEET_TECHNICAL_REPORT',
      );
      throw new Error('Report queue unavailable');
    });
    const reportService = new ExecutionService(mockPrisma as unknown as PrismaClient, storagePort, {
      reportGeneration: { requestGeneration },
    });
    mockPrisma.order.findUnique.mockResolvedValue(completeOrderFixture());

    await expect(reportService.completeOrder('admin-1', 'ADMIN', 'order-1')).resolves.toMatchObject(
      {
        status: OrderStatus.COMPLETED,
      },
    );
    expect(requestGeneration).toHaveBeenCalledWith('order-1', 'admin-1');
    expect(outboxExistsBeforeGeneration).toBe(true);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
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
          evidence: Array.from({ length: MIN_REQUIRED_EVIDENCE_PHOTOS }, (_, index) => ({
            id: `ev-${index + 1}`,
            status: UploadStatus.COMPLETED,
          })),
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

  it('completes order applying pricingOverrides when present on the order', async () => {
    const checklistItems = ALL_CHECKLIST_CATEGORIES.map((category) => ({
      category,
      condition: 'GOOD',
    }));

    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      serviceType: 'INSTALLATION',
      technicianId: 'tech-1',
      technician: {
        id: 'tech-1',
        name: 'Tecnico Demo',
        installationRate: '500.00',
        departureCost: '200.00',
      },
      isHomeService: false,
      pricingOverrides: {
        rates: { INSTALLATION: '800.00' },
        travelExpenses: '300.00',
      },
      units: [
        {
          id: 'unit-1',
          label: 'Unidad 01',
          serialNumber: 'SN-001',
          equipment: [{ externalKey: 'EQ-001', verificationStatus: 'MATCHED' }],
          evidence: Array.from({ length: MIN_REQUIRED_EVIDENCE_PHOTOS }, (_, index) => ({
            id: `ev-${index + 1}`,
            status: UploadStatus.COMPLETED,
          })),
          checklist: { items: checklistItems },
        },
      ],
      signature: { signerName: 'Cliente' },
    });

    const result = await service.completeOrder('admin-1', 'ADMIN', 'order-1');
    expect(result.status).toBe(OrderStatus.COMPLETED);
    expect(result.pricingBaseCost?.toString()).toBe('800');
    expect(result.pricingTravelExpenses?.toString()).toBe('300');
    expect(result.pricingTotal?.toString()).toBe('1100');
    expect(result.warnings ?? []).toHaveLength(0);
  });

  it('rejects completion pricing overflow before any transaction or queued effects', async () => {
    const fixture = completeOrderFixture();
    const overflowOrder = {
      ...fixture,
      technician: { ...fixture.technician, installationRate: '99999999.99' },
      units: [
        {
          ...fixture.units[0]!,
          equipment: [
            ...fixture.units[0]!.equipment,
            {
              id: 'eq-2',
              externalKey: 'EQ-002',
              sheetRowHint: 8,
              serviceStatusSnapshot: 'STOCK TECNICO',
              verificationStatus: 'MATCHED' as const,
            },
          ],
        },
      ],
    };
    mockPrisma.order.findUnique.mockResolvedValue(overflowOrder);

    await expect(service.completeOrder('admin-1', 'ADMIN', 'order-1')).rejects.toMatchObject({
      code: 'PRICING_AMOUNT_OUT_OF_RANGE',
      status: 400,
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(enqueuedOperations).toHaveLength(0);
  });

  it.each(['failAppointment', 'requireCorrection'] as const)(
    'rejects calculated overflow before %s mutates the order',
    async (operation) => {
      const fixture = completeOrderFixture();
      const pricingOverflowOrder = {
        ...fixture,
        status: operation === 'failAppointment' ? OrderStatus.ASSIGNED : OrderStatus.IN_PROGRESS,
        serviceType: operation === 'failAppointment' ? 'FAILED_APPOINTMENT' : 'INSTALLATION',
        technician: {
          ...fixture.technician,
          ...(operation === 'failAppointment'
            ? { failedAppointmentRate: '99999999.99' }
            : { installationRate: '99999999.99' }),
        },
        units: [
          {
            ...fixture.units[0]!,
            equipment: [
              ...fixture.units[0]!.equipment,
              {
                id: 'eq-2',
                externalKey: 'EQ-002',
                sheetRowHint: 8,
                serviceStatusSnapshot: 'STOCK TECNICO',
                verificationStatus: 'MATCHED' as const,
              },
            ],
          },
        ],
      };
      mockPrisma.order.findUnique.mockResolvedValue(pricingOverflowOrder);

      const result =
        operation === 'failAppointment'
          ? service.failAppointment('admin-1', 'ADMIN', 'order-1', { failedReason: 'No contact' })
          : service.requireCorrection('admin-1', 'order-1', { notes: 'Please correct' });

      await expect(result).rejects.toMatchObject({
        code: 'PRICING_AMOUNT_OUT_OF_RANGE',
        status: 400,
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(enqueuedOperations).toHaveLength(0);
    },
  );

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

describe('execution equipment ownership chain', () => {
  const methods = ['verify', 'discrepancy'] as const;
  function harness(role: 'ADMIN' | 'TECHNICIAN' = 'TECHNICIAN', shared = false) {
    const tx = {
      orderEquipment: { update: vi.fn(async () => ({ id: 'eq-1' })) },
      discrepancy: { create: vi.fn(async () => ({ id: 'disc-1' })) },
      auditLog: { createMany: vi.fn() },
      sheetSyncOperation: { createMany: vi.fn() },
    };
    const database = {
      order: {
        findUnique: vi.fn(async () => ({
          id: 'order-1',
          technicianId: 'tech-1',
          status: OrderStatus.IN_PROGRESS as OrderStatus,
        })),
      },
      user: {
        findUnique: vi.fn(async () => ({ active: true, technicianId: shared ? null : 'tech-1' })),
      },
      sharedTechnicianAccess: {
        findUnique: vi.fn(async () => (shared ? { userId: 'actor-1', orderId: null } : null)),
      },
      orderUnit: {
        findUnique: vi.fn(
          async () =>
            ({ id: 'unit-1', orderId: 'order-1' }) as { id: string; orderId: string } | null,
        ),
      },
      orderEquipment: {
        findUnique: vi.fn(
          async () =>
            ({ id: 'eq-1', orderUnitId: 'unit-1', externalKey: 'EQ-1' }) as {
              id: string;
              orderUnitId: string;
              externalKey: string;
            } | null,
        ),
      },
      $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = new ExecutionService(
      database as unknown as PrismaClient,
      new DevMockStorageClient(),
    );
    const invoke = (method: (typeof methods)[number]) =>
      method === 'verify'
        ? service.verifyEquipment('actor-1', role, 'order-1', 'unit-1', 'eq-1')
        : service.reportDiscrepancy('actor-1', role, 'order-1', 'unit-1', 'eq-1', {
            type: 'IMEI',
            description: 'IMEI differs from label',
          });
    return { database, tx, invoke };
  }

  describe.each(methods)('%s', (method) => {
    it.each(['missing', 'foreign'])(
      'rejects a %s unit before looking up equipment or opening a transaction',
      async (kind) => {
        const h = harness();
        h.database.orderUnit.findUnique.mockResolvedValue(
          kind === 'missing' ? null : { id: 'unit-1', orderId: 'order-2' },
        );
        await expect(h.invoke(method)).rejects.toMatchObject({
          status: 404,
          code: 'UNIT_NOT_FOUND',
        });
        expect(h.database.orderEquipment.findUnique).not.toHaveBeenCalled();
        expect(h.database.$transaction).not.toHaveBeenCalled();
      },
    );

    it.each(['missing', 'foreign'])(
      'rejects %s equipment before opening a transaction',
      async (kind) => {
        const h = harness();
        h.database.orderEquipment.findUnique.mockResolvedValue(
          kind === 'missing' ? null : { id: 'eq-1', orderUnitId: 'unit-2', externalKey: 'EQ-1' },
        );
        await expect(h.invoke(method)).rejects.toMatchObject({
          status: 404,
          code: 'EQUIPMENT_NOT_FOUND',
        });
        expect(h.database.$transaction).not.toHaveBeenCalled();
      },
    );

    it('preserves access denial before child lookups for an active unrelated technician', async () => {
      const h = harness();
      h.database.user.findUnique.mockResolvedValue({ active: true, technicianId: 'tech-2' });
      await expect(h.invoke(method)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
      expect(h.database.orderUnit.findUnique).not.toHaveBeenCalled();
      expect(h.database.$transaction).not.toHaveBeenCalled();
    });

    it('preserves the order state check before child lookups', async () => {
      const h = harness('ADMIN');
      h.database.order.findUnique.mockResolvedValue({
        id: 'order-1',
        technicianId: 'tech-1',
        status: OrderStatus.DRAFT,
      });
      await expect(h.invoke(method)).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_ORDER_STATE',
      });
      expect(h.database.orderUnit.findUnique).not.toHaveBeenCalled();
      expect(h.database.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'administrator', role: 'ADMIN' as const, shared: false },
      { name: 'active assigned technician', role: 'TECHNICIAN' as const, shared: false },
      { name: 'active shared technician', role: 'TECHNICIAN' as const, shared: true },
    ])('preserves mutations and audit for a valid chain with $name', async ({ role, shared }) => {
      const h = harness(role, shared);
      await h.invoke(method);
      expect(h.database.$transaction).toHaveBeenCalledTimes(1);
      expect(h.tx.orderEquipment.update).toHaveBeenCalledTimes(1);
      expect(h.tx.orderEquipment.update).toHaveBeenCalledWith({
        where: { id: 'eq-1' },
        data: {
          verificationStatus: method === 'verify' ? 'MATCHED' : 'DISCREPANCY_REPORTED',
          verifiedAt: expect.any(Date),
          verifiedById: 'actor-1',
        },
      });
      expect(h.tx.discrepancy.create).toHaveBeenCalledTimes(method === 'discrepancy' ? 1 : 0);
      if (method === 'discrepancy')
        expect(h.tx.discrepancy.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            orderId: 'order-1',
            orderUnitId: 'unit-1',
            orderEquipmentId: 'eq-1',
            reportedById: 'actor-1',
          }),
        });
      expect(h.tx.auditLog.createMany).toHaveBeenCalledExactlyOnceWith({
        data: [
          expect.objectContaining({
            action: method === 'verify' ? 'EQUIPMENT_VERIFIED' : 'DISCREPANCY_REPORTED',
            actorUserId: 'actor-1',
            entityType: method === 'verify' ? 'OrderEquipment' : 'Discrepancy',
            entityId: method === 'verify' ? 'eq-1' : 'disc-1',
            after: { id: method === 'verify' ? 'eq-1' : 'disc-1' },
          }),
        ],
      });
      expect(h.tx.sheetSyncOperation.createMany).not.toHaveBeenCalled();
    });
  });
});

describe('completeness actor authorization', () => {
  function harness() {
    const fullOrder = { ...completeOrderFixture(), status: OrderStatus.IN_PROGRESS as OrderStatus };
    const requirementsRead = vi.fn(async () => fullOrder);
    const database = {
      order: {
        findUnique: vi
          .fn()
          .mockImplementation(async (args: { include?: { units?: unknown } }) =>
            args.include?.units ? requirementsRead() : fullOrder,
          ),
      },
      user: { findUnique: vi.fn().mockResolvedValue({ active: true, technicianId: 'tech-1' }) },
      sharedTechnicianAccess: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const service = new ExecutionService(
      database as unknown as PrismaClient,
      new DevMockStorageClient(),
    );
    return { database, requirementsRead, service, fullOrder };
  }

  it('rejects an active unrelated technician before reading requirements', async () => {
    const h = harness();
    h.database.user.findUnique.mockResolvedValue({ active: true, technicianId: 'tech-other' });
    await expect(
      h.service.validateCompleteness('actor-1', 'TECHNICIAN', 'order-1'),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(h.requirementsRead).not.toHaveBeenCalled();
    expect(h.database.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing order before reading requirements', async () => {
    const h = harness();
    h.database.order.findUnique.mockImplementation(
      async (args: { include?: { units?: unknown } }) =>
        args.include?.units ? h.requirementsRead() : null,
    );
    await expect(
      h.service.validateCompleteness('actor-1', 'ADMIN', 'order-1'),
    ).rejects.toMatchObject({ status: 404, code: 'ORDER_NOT_FOUND' });
    expect(h.requirementsRead).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'TECHNICIAN'] as const)(
    'returns the unchanged completeness result for %s',
    async (role) => {
      const h = harness();
      await expect(h.service.validateCompleteness('actor-1', role, 'order-1')).resolves.toEqual({
        isComplete: true,
        missingRequirements: [],
      });
      expect(h.requirementsRead).toHaveBeenCalledTimes(1);
      expect(h.database.order.findUnique).toHaveBeenLastCalledWith({
        where: { id: 'order-1' },
        include: {
          units: {
            include: {
              equipment: true,
              evidence: { where: { status: UploadStatus.COMPLETED, deletedAt: null } },
              checklist: { include: { items: true } },
            },
          },
          signature: true,
        },
      });
      expect(h.database.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(Object.values(OrderStatus))(
    'preserves shared-account access policy in state %s',
    async (status) => {
      const h = harness();
      h.fullOrder.status = status;
      h.database.sharedTechnicianAccess.findUnique.mockResolvedValue({
        userId: 'actor-shared',
        orderId: null,
      });
      h.database.user.findUnique.mockResolvedValue({ active: true, technicianId: null });
      const result = h.service.validateCompleteness('actor-shared', 'TECHNICIAN', 'order-1');
      if (['ASSIGNED', 'IN_PROGRESS', 'REQUIRES_CORRECTION'].includes(status)) {
        await expect(result).resolves.toEqual({ isComplete: true, missingRequirements: [] });
        expect(h.requirementsRead).toHaveBeenCalledTimes(1);
      } else {
        await expect(result).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
        expect(h.requirementsRead).not.toHaveBeenCalled();
      }
    },
  );
});
