import { describe, expect, it, vi } from 'vitest';
import { updateExecutionNotes } from '../api.js';
import { useExecutionNotes } from './useExecutionNotes.js';

vi.mock('../api.js', () => ({ updateExecutionNotes: vi.fn() }));

describe('useExecutionNotes', () => {
  it('normalizes notes and clears the dirty flag after a successful save', async () => {
    vi.mocked(updateExecutionNotes).mockResolvedValueOnce({});
    const notes = useExecutionNotes('order-1');
    notes.executionNotes.value = '  Work completed  ';
    notes.executionNotesDirty.value = true;

    await notes.saveExecutionNotes();

    expect(updateExecutionNotes).toHaveBeenCalledWith('order-1', { notes: 'Work completed' });
    expect(notes.executionNotesDirty.value).toBe(false);
    expect(notes.savingExecutionNotes.value).toBe(false);
  });

  it('sends null for blank notes and keeps saving state through the refresh callback', async () => {
    vi.mocked(updateExecutionNotes).mockResolvedValueOnce({});
    const notes = useExecutionNotes('order-2');
    notes.executionNotes.value = '   ';
    notes.executionNotesDirty.value = true;
    const onSaved = vi.fn(async () => {
      expect(notes.savingExecutionNotes.value).toBe(true);
      expect(notes.executionNotesDirty.value).toBe(false);
    });

    await notes.saveExecutionNotes(onSaved);

    expect(updateExecutionNotes).toHaveBeenCalledWith('order-2', { notes: null });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(notes.savingExecutionNotes.value).toBe(false);
  });

  it('keeps unsaved notes dirty and resets saving state when persistence fails', async () => {
    const failure = new Error('Save failed');
    vi.mocked(updateExecutionNotes).mockRejectedValueOnce(failure);
    const notes = useExecutionNotes('order-3');
    notes.executionNotesDirty.value = true;
    const onSaved = vi.fn();

    await expect(notes.saveExecutionNotes(onSaved)).rejects.toBe(failure);

    expect(notes.executionNotesDirty.value).toBe(true);
    expect(notes.savingExecutionNotes.value).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
