import { ref } from 'vue';
import {
  MAX_ORDER_NOTES_LENGTH,
  type ChecklistCategory,
  type ChecklistCondition,
  type SaveChecklistItem,
} from '@puk/contracts';
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
  const savedChecklistsByUnit = ref<Record<string, Record<ChecklistCategory, LocalChecklistItem>>>(
    {},
  );

  function initChecklistForUnit(unitId: string, existingItems?: ExistingChecklistItem[]) {
    const existingMap = checklistsByUnit.value[unitId];
    const checklist = {} as Record<ChecklistCategory, LocalChecklistItem>;
    const savedSnapshot = {} as Record<ChecklistCategory, LocalChecklistItem>;

    for (const category of CATEGORIES) {
      const savedItem = existingItems?.find((item) => item.category === category);
      const serverCondition = savedItem?.condition ?? 'GOOD';
      const serverNotes = savedItem?.notes ?? '';

      savedSnapshot[category] = {
        category,
        condition: serverCondition,
        notes: serverCondition === 'BAD' ? serverNotes.trim() : '',
      };

      checklist[category] = {
        category,
        condition: existingMap?.[category]?.condition ?? serverCondition,
        notes: existingMap?.[category]?.notes ?? serverNotes,
      };
    }

    savedChecklistsByUnit.value[unitId] = savedSnapshot;
    checklistsByUnit.value[unitId] = checklist;
  }

  function isUnitChecklistDirty(unitId: string): boolean {
    const current = checklistsByUnit.value[unitId];
    const saved = savedChecklistsByUnit.value[unitId];
    if (!current || !saved) return false;
    return CATEGORIES.some((category) => {
      const currItem = current[category];
      const savedItem = saved[category];
      if (currItem.condition !== savedItem.condition) return true;
      const currNotes = currItem.condition === 'BAD' ? currItem.notes.trim() : '';
      const savedNotes = savedItem.condition === 'BAD' ? savedItem.notes.trim() : '';
      return currNotes !== savedNotes;
    });
  }

  function markUnitChecklistSaved(unitId: string): void {
    const current = checklistsByUnit.value[unitId];
    if (!current) return;
    const snapshot = {} as Record<ChecklistCategory, LocalChecklistItem>;
    for (const category of CATEGORIES) {
      snapshot[category] = {
        category,
        condition: current[category].condition,
        notes: current[category].condition === 'BAD' ? current[category].notes.trim() : '',
      };
    }
    savedChecklistsByUnit.value[unitId] = snapshot;
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

    const oversizedItem = items.find(
      (item) => typeof item.notes === 'string' && item.notes.length > MAX_ORDER_NOTES_LENGTH,
    );
    if (oversizedItem) {
      return {
        ok: false,
        message: `Las observaciones no pueden superar ${MAX_ORDER_NOTES_LENGTH.toLocaleString('es-MX')} caracteres.`,
      };
    }

    return { ok: true, items };
  }

  return {
    checklistsByUnit,
    createSaveChecklistItems,
    getUnitItem,
    initChecklistForUnit,
    isUnitChecklistDirty,
    markUnitChecklistSaved,
  };
}
