import { describe, expect, it } from 'vitest';
import { applyPlanToSnapshot, planTechnicianIds } from './technician-id-plan.mjs';

const header = ['TECNICO', ...Array(21).fill(''), 'ID_TECNICO'];
const technician = (name, id = '') => [name, ...Array(21).fill(''), id];

describe('one-time technician identity initialization', () => {
  it('assigns text codes to actual technician rows and preserves other cells', () => {
    const rows = [header, ['Técnico de prueba', 'Taller'], [], ['Segundo técnico', 'Otro taller']];
    const plan = planTechnicianIds(rows);
    expect(plan.changes).toEqual([
      { rowNumber: 2, id: 'TEC-0001' },
      { rowNumber: 4, id: 'TEC-0002' },
    ]);
    const result = applyPlanToSnapshot(rows, plan.changes);
    expect(result[1][22]).toBe('TEC-0001');
    expect(result[3][22]).toBe('TEC-0002');
    expect(result[1].slice(0, 2)).toEqual(rows[1]);
    expect(result[0]).toEqual(header);
    expect(result[2]).toEqual([]);
    expect(rows[1]).toHaveLength(2);
  });

  it('is a no-op after completion, including when rows move', () => {
    expect(
      planTechnicianIds([
        header,
        technician('Segundo', 'TEC-0002'),
        technician('Primero', 'TEC-0001'),
      ]).changes,
    ).toEqual([]);
  });

  it('rejects duplicate identifiers before writing', () => {
    expect(() =>
      planTechnicianIds([
        header,
        technician('Primero', 'TEC-0001'),
        technician('Segundo', 'TEC-0001'),
      ]),
    ).toThrow('DUPLICATE_TECHNICIAN_ID');
  });

  it.each(['=ROW()', 'manual note', 123, ' '])('never replaces existing W content: %s', (value) => {
    expect(() => planTechnicianIds([header, technician('Técnico', value)])).toThrow(
      'EXISTING_ID_REQUIRES_REVIEW',
    );
  });

  it('requires review for incomplete technician rows', () => {
    expect(() => planTechnicianIds([header, ['', 'Taller sin nombre']])).toThrow(
      'TECHNICIAN_ROW_REQUIRES_REVIEW',
    );
  });

  it('does not recycle possibly retired identifiers on later partial runs', () => {
    expect(() =>
      planTechnicianIds([header, technician('Anterior', 'TEC-0001'), technician('Nuevo')]),
    ).toThrow('PARTIAL_INITIALIZATION_REQUIRES_REVIEW');
  });

  it('requires the inspected headers at their known positions', () => {
    expect(() => planTechnicianIds([['TECNICO', 'ID_TECNICO']])).toThrow(
      'DIRECTORY_HEADERS_CHANGED',
    );
  });
});
