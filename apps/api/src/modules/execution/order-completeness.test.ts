import { describe, expect, it } from 'vitest';
import { MIN_REQUIRED_EVIDENCE_PHOTOS } from '@puk/contracts';

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
        evidence: Array.from({ length: MIN_REQUIRED_EVIDENCE_PHOTOS }, () => ({
          status: 'COMPLETED',
        })),
        checklist: {
          items: [
            {
              category: 'DASHBOARD',
            },
            { category: 'WINDOWS' },
            { category: 'ACCESSORIES' },
            { category: 'TRIMS' },
            { category: 'BODYWORK' },
          ],
        },
      },
    ],
    signature: {
      signerName: 'Juan Pérez',
    },
  };

  it('passes with unit-level photos and all checklist sections even when sections have no photos', () => {
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
              { category: 'DASHBOARD' },
              { category: 'WINDOWS' },
              { category: 'ACCESSORIES' },
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

  it('fails when fewer than 10 photos are completed for a unit', () => {
    const order: OrderForCompletenessEvaluation = {
      ...completeOrder,
      units: [
        {
          label: 'Tracto 101',
          equipment: [],
          evidence: [
            { status: 'COMPLETED' },
            { status: 'PENDING' }, // Not completed!
            { status: 'COMPLETED' },
          ],
          checklist: {
            items: [
              { category: 'DASHBOARD' },
              { category: 'WINDOWS' },
              { category: 'ACCESSORIES' },
              { category: 'TRIMS' },
              { category: 'BODYWORK' },
            ],
          },
        },
      ],
    };
    const result = evaluateOrderCompleteness(order);
    expect(result.isComplete).toBe(false);
    expect(result.missingRequirements).toContain(
      `Se requieren al menos ${MIN_REQUIRED_EVIDENCE_PHOTOS} fotografías de evidencia en unidad Tracto 101 (actualmente 2/${MIN_REQUIRED_EVIDENCE_PHOTOS})`,
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
