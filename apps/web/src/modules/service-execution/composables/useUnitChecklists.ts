import { ref } from 'vue';
import type { ChecklistCategory, ChecklistCondition, SaveChecklistItem } from '@puk/contracts';
import { CATEGORY_NAMES } from '../../orders/index.js';

export interface LocalChecklistItem {
  category: ChecklistCategory;
  condition: ChecklistCondition;
  notes: string;
}

export const CATEGORIES: readonly ChecklistCategory[] = [
  'DASHBOARD',
  'WINDOWS',
  'ACCESSORIES',
  'TRIMS',
  'BODYWORK',
];

export { CATEGORY_NAMES };

interface ExistingChecklistItem {
  category: ChecklistCategory;
  condition?: ChecklistCondition | null;
  notes?: string | null;
}

type SaveChecklistItemsResult =
  { ok: true; items: SaveChecklistItem[] } | { ok: false; message: string };

export function useUnitChecklists() {
  const checklistsByUnit = ref<Record<string, Record<ChecklistCategory, LocalChecklistItem>>>({});

  function initChecklistForUnit(unitId: string, existingItems?: ExistingChecklistItem[]) {
    const existingMap = checklistsByUnit.value[unitId];
    const checklist = {} as Record<ChecklistCategory, LocalChecklistItem>;

    for (const category of CATEGORIES) {
      const savedItem = existingItems?.find((item) => item.category === category);
      checklist[category] = {
        category,
        condition: existingMap?.[category]?.condition ?? savedItem?.condition ?? 'GOOD',
        notes: existingMap?.[category]?.notes ?? savedItem?.notes ?? '',
      };
    }

    checklistsByUnit.value[unitId] = checklist;
  }

  function getUnitItem(unitId: string, category: ChecklistCategory): LocalChecklistItem {
    let checklist = checklistsByUnit.value[unitId];
    if (!checklist) {
      initChecklistForUnit(unitId);
      checklist = checklistsByUnit.value[unitId]!;
    }
    return checklist[category];
  }

  function createSaveChecklistItems(unitId: string): SaveChecklistItemsResult | null {
    const checklist = checklistsByUnit.value[unitId];
    if (!checklist) return null;

    const items: SaveChecklistItem[] = Object.values(checklist).map((item) => ({
      category: item.category,
      condition: item.condition,
      notes: item.condition === 'BAD' ? item.notes.trim() : null,
    }));

    const invalidItem = items.find(
      (item) => item.condition === 'BAD' && (!item.notes || !item.notes.trim()),
    );
    if (invalidItem) {
      return {
        ok: false,
        message: `Debe indicar la observación para la categoría "${CATEGORY_NAMES[invalidItem.category]}" marcada como Mal.`,
      };
    }

    return { ok: true, items };
  }

  return {
    checklistsByUnit,
    createSaveChecklistItems,
    getUnitItem,
    initChecklistForUnit,
  };
}
