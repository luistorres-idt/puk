import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { OrderExecutionDetailSchema } from './order-read-models.js';

const executionDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  folio: 'OS-DEMO',
  status: 'ASSIGNED',
  serviceType: 'INSTALLATION',
  clientNameSnapshot: 'Client',
  scheduledAt: '2026-09-14T18:00:00.000Z',
  isHomeService: false,
  serviceAddress: null,
  generalNotes: null,
  correctionReason: null,
  technician: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Technician',
    taxData: 'must-not-leave-the-api',
    installationRate: '500.00',
  },
  units: [],
  signature: null,
  createdBy: { email: 'admin@example.com' },
  syncOperations: [{ id: 'internal-operation' }],
};

describe('order read model contracts', () => {
  it('strips administrative and technician-private fields from execution responses', () => {
    const result = v.parse(OrderExecutionDetailSchema, executionDetail);

    expect(result).not.toHaveProperty('createdBy');
    expect(result).not.toHaveProperty('syncOperations');
    expect(result.technician).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Technician',
    });
  });

  it('requires the complete execution projection', () => {
    const incomplete: Record<string, unknown> = { ...executionDetail };
    delete incomplete.units;

    expect(v.safeParse(OrderExecutionDetailSchema, incomplete).success).toBe(false);
  });
});
