import { describe, expect, it } from 'vitest';
import { CATEGORIES, useUnitChecklists } from './useUnitChecklists.js';

describe('useUnitChecklists', () => {
  it('keeps unsaved local changes when refreshed data initializes the unit again', () => {
    const { getUnitItem, initChecklistForUnit } = useUnitChecklists();

    initChecklistForUnit('unit-1', [
      { category: 'DASHBOARD', condition: 'GOOD', notes: 'Saved note' },
    ]);
    getUnitItem('unit-1', 'DASHBOARD').condition = 'BAD';
    getUnitItem('unit-1', 'DASHBOARD').notes = 'Unsaved local note';

    initChecklistForUnit('unit-1', [
      { category: 'DASHBOARD', condition: 'NOT_APPLICABLE', notes: 'Reloaded note' },
    ]);

    expect(getUnitItem('unit-1', 'DASHBOARD')).toEqual({
      category: 'DASHBOARD',
      condition: 'BAD',
      notes: 'Unsaved local note',
    });
  });

  it('initializes every category with defaults when a unit has no saved checklist', () => {
    const { checklistsByUnit, getUnitItem } = useUnitChecklists();

    expect(getUnitItem('unit-1', 'BODYWORK')).toEqual({
      category: 'BODYWORK',
      condition: 'GOOD',
      notes: '',
    });
    expect(Object.keys(checklistsByUnit.value['unit-1'] ?? {})).toEqual(CATEGORIES);
  });

  it('normalizes notes for items that are ready to save', () => {
    const { createSaveChecklistItems, getUnitItem } = useUnitChecklists();

    getUnitItem('unit-1', 'DASHBOARD').condition = 'BAD';
    getUnitItem('unit-1', 'DASHBOARD').notes = '  Broken indicator  ';
    getUnitItem('unit-1', 'WINDOWS').condition = 'NOT_APPLICABLE';
    getUnitItem('unit-1', 'WINDOWS').notes = 'Must not be sent';
    getUnitItem('unit-1', 'ACCESSORIES').notes = 'Must not be sent either';

    const result = createSaveChecklistItems('unit-1');

    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.items.find((item) => item.category === 'DASHBOARD')?.notes).toBe(
      'Broken indicator',
    );
    expect(result.items.find((item) => item.category === 'WINDOWS')?.notes).toBeNull();
    expect(result.items.find((item) => item.category === 'ACCESSORIES')?.notes).toBeNull();
  });

  it('rejects a BAD item without notes using the category-specific message', () => {
    const { createSaveChecklistItems, getUnitItem } = useUnitChecklists();

    getUnitItem('unit-1', 'BODYWORK').condition = 'BAD';
    getUnitItem('unit-1', 'BODYWORK').notes = '   ';

    expect(createSaveChecklistItems('unit-1')).toEqual({
      ok: false,
      message:
        'Debe indicar la observación para la categoría "Carrocería y Exteriores" marcada como Mal.',
    });
  });

  it('rejects oversized checklist notes before saving and keeps the local content', () => {
    const { createSaveChecklistItems, getUnitItem } = useUnitChecklists();
    getUnitItem('unit-1', 'DASHBOARD').condition = 'BAD';
    getUnitItem('unit-1', 'DASHBOARD').notes = 'x'.repeat(5001);

    expect(createSaveChecklistItems('unit-1')).toMatchObject({
      ok: false,
      message: expect.stringContaining('5,000'),
    });
    expect(getUnitItem('unit-1', 'DASHBOARD').notes).toHaveLength(5001);
  });
});
