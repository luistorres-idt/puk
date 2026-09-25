import { ref } from 'vue';
import { updateExecutionNotes } from '../api.js';

export function useExecutionNotes(orderId: string) {
  const executionNotes = ref('');
  const executionNotesDirty = ref(false);
  const savingExecutionNotes = ref(false);

  async function saveExecutionNotes(onSaved?: () => Promise<void>) {
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
