import { ref } from 'vue';
import { MAX_ORDER_NOTES_LENGTH } from '@puk/contracts';
import { updateExecutionNotes } from '../api.js';

export function useExecutionNotes(orderId: string) {
  const executionNotes = ref('');
  const executionNotesDirty = ref(false);
  const savingExecutionNotes = ref(false);

  async function saveExecutionNotes(onSaved?: () => Promise<void>) {
    if (executionNotes.value.length > MAX_ORDER_NOTES_LENGTH) {
      throw new Error(
        `Las notas no pueden superar ${MAX_ORDER_NOTES_LENGTH.toLocaleString('es-MX')} caracteres.`,
      );
    }
    savingExecutionNotes.value = true;
    try {
      await updateExecutionNotes(orderId, { notes: executionNotes.value.trim() || null });
      executionNotesDirty.value = false;
      await onSaved?.();
    } finally {
      savingExecutionNotes.value = false;
    }
  }

  return { executionNotes, executionNotesDirty, savingExecutionNotes, saveExecutionNotes };
}
