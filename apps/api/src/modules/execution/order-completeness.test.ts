import { describe, expect, it } from 'vitest';

import {
  evaluateOrderCompleteness,
  type OrderForCompletenessEvaluation,
} from './order-completeness.js';

describe('evaluateOrderCompleteness', () => {
  const completeOrder: OrderForCompletenessEvaluation = {
    units: [
      {
        label: 'Tracto 101',
        equipment: [
          { externalKey: 'EQ-001', verificationStatus: 'MATCHED' },
          { externalKey: 'EQ-002', verificationStatus: 'DISCREPANCY_REPORTED' },
        ],
        checklist: {
          items: [
            { category: 'DASHBOARD', evidence: [{ status: 'COMPLETED' }] },
            { category: 'WINDOWS', evidence: [{ status: 'COMPLETED' }] },
            { category: 'ACCESSORIES', evidence: [{ status: 'COMPLETED' }] },
            { category: 'TRIMS', evidence: [] },
            { category: 'BODYWORK', evidence: [] },
          ],
        },
      },
    ],
    signature: {
      signerName: 'Juan Pérez',
    },
  };

  it('passes when all units, equipments, checklist items, photos, and signature are present', () => {
    const result = evaluateOrderCompleteness(completeOrder);
    expect(result.isComplete).toBe(true);
    expect(result.missingRequirements).toHaveLength(0);
  });

  it('fails when order has zero units', () => {
    const result = evaluateOrderCompleteness({ units: [], signature: { signerName: 'Juan' } });
    expect(result.isComplete).toBe(false);
    expect(result.missingRequirements).toContain('No hay unidades registradas en la orden');
  });

  it('fails when equipment verification is pending', () => {
    const order: OrderForCompletenessEvaluation = {
      ...completeOrder,
      units: [
        {
          ...completeOrder.units[0]!,
          equipment: [{ externalKey: 'EQ-999', verificationStatus: 'PENDING' }],
        },
      ],
    };
    const result = evaluateOrderCompleteness(order);
    expect(result.isComplete).toBe(false);
    expect(result.missingRequirements).toContain(
      'Equipo EQ-999 en unidad Tracto 101 pendiente de verificación',
    );
  });

  it('fails when checklist is missing entirely for a unit', () => {
    const order: OrderForCompletenessEvaluation = {
      ...completeOrder,
      units: [
        {
          label: 'Tracto 101',
          equipment: [],
          checklist: null,
        },
      ],
    };
    const result = evaluateOrderCompleteness(order);
    expect(result.isComplete).toBe(false);
    expect(result.missingRequirements).toContain('Checklist pendiente en unidad Tracto 101');
  });

  it('fails when a mandatory category is missing from the checklist', () => {
    const order: OrderForCompletenessEvaluation = {
      ...completeOrder,
      units: [
        {
          label: 'Tracto 101',
          equipment: [],
          checklist: {
            items: [
              { category: 'DASHBOARD', evidence: [{ status: 'COMPLETED' }] },
              { category: 'WINDOWS', evidence: [{ status: 'COMPLETED' }] },
              { category: 'ACCESSORIES', evidence: [{ status: 'COMPLETED' }] },
              // Missing TRIMS and BODYWORK
            ],
          },
        },
      ],
    };
    const result = evaluateOrderCompleteness(order);
    expect(result.isComplete).toBe(false);
    expect(result.missingRequirements).toContain(
      'Falta categoría TRIMS en checklist de unidad Tracto 101',
    );
    expect(result.missingRequirements).toContain(
      'Falta categoría BODYWORK en checklist de unidad Tracto 101',
    );
  });

  it('fails when fewer than 3 photos are completed for a unit', () => {
    const order: OrderForCompletenessEvaluation = {
      ...completeOrder,
      units: [
        {
          label: 'Tracto 101',
          equipment: [],
          checklist: {
            items: [
              { category: 'DASHBOARD', evidence: [{ status: 'COMPLETED' }] },
              { category: 'WINDOWS', evidence: [{ status: 'PENDING' }] }, // Not completed!
              { category: 'ACCESSORIES', evidence: [{ status: 'COMPLETED' }] },
              { category: 'TRIMS', evidence: [] },
              { category: 'BODYWORK', evidence: [] },
            ],
          },
        },
      ],
    };
    const result = evaluateOrderCompleteness(order);
    expect(result.isComplete).toBe(false);
    expect(result.missingRequirements).toContain(
      'Se requieren al menos 3 fotografías de evidencia en unidad Tracto 101 (actualmente 2/3)',
    );
  });

  it('fails when signature is absent or signerName is empty', () => {
    const result1 = evaluateOrderCompleteness({ ...completeOrder, signature: null });
    expect(result1.isComplete).toBe(false);
    expect(result1.missingRequirements).toContain('Falta firma y nombre del cliente');

    const result2 = evaluateOrderCompleteness({
      ...completeOrder,
      signature: { signerName: '' },
    });
    expect(result2.isComplete).toBe(false);
    expect(result2.missingRequirements).toContain('Falta firma y nombre del cliente');
  });
});
