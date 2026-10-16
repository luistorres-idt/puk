import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  RequireCorrectionSchema,
  ReportDiscrepancySchema,
  SaveChecklistItemSchema,
  SaveChecklistSchema,
  UpdateExecutionNotesSchema,
} from './execution.js';
import { MAX_ORDER_NOTES_LENGTH } from './validation-limits.js';

describe('discrepancy description contract', () => {
  it('trims outer whitespace, preserves internal formatting, and enforces 1500 UTF-16 code units', () => {
    const exact = '😀'.repeat(750);
    expect(exact.length).toBe(1500);
    expect(
      v.safeParse(ReportDiscrepancySchema, { type: 'OTHER', description: exact }).success,
    ).toBe(true);
    expect(
      v.safeParse(ReportDiscrepancySchema, { type: 'OTHER', description: `${exact}x` }).success,
    ).toBe(false);
    expect(
      v.parse(ReportDiscrepancySchema, {
        type: 'OTHER',
        description: '  first line\n  second line  ',
      }).description,
    ).toBe('first line\n  second line');
    expect(
      v.safeParse(ReportDiscrepancySchema, { type: 'OTHER', description: '   ' }).success,
    ).toBe(false);
  });

  it('limits each observed snapshot value to 500 UTF-16 code units without normalizing it', () => {
    const exact = '😀'.repeat(250);
    expect(exact.length).toBe(500);
    expect(
      v.safeParse(ReportDiscrepancySchema, {
        type: 'OTHER',
        description: 'Mismatch',
        observedSnapshot: { observed: exact },
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(ReportDiscrepancySchema, {
        type: 'OTHER',
        description: 'Mismatch',
        observedSnapshot: { observed: `${exact}x` },
      }).success,
    ).toBe(false);
    expect(
      v.parse(ReportDiscrepancySchema, {
        type: 'OTHER',
        description: 'Mismatch',
        observedSnapshot: { observed: '  internal whitespace  ' },
      }).observedSnapshot,
    ).toEqual({ observed: '  internal whitespace  ' });
    expect(
      v.parse(ReportDiscrepancySchema, { type: 'OTHER', description: 'Mismatch' }).observedSnapshot,
    ).toBeUndefined();
  });
});

describe('execution note contracts', () => {
  it('accepts exactly 5000 UTF-16 code units and rejects longer notes across all note fields', () => {
    const exact = '😀'.repeat(MAX_ORDER_NOTES_LENGTH / 2);
    const tooLong = `${exact}x`;
    expect(exact.length).toBe(MAX_ORDER_NOTES_LENGTH);
    expect(v.safeParse(UpdateExecutionNotesSchema, { notes: exact }).success).toBe(true);
    expect(v.safeParse(UpdateExecutionNotesSchema, { notes: tooLong }).success).toBe(false);
    expect(v.safeParse(RequireCorrectionSchema, { notes: exact }).success).toBe(true);
    expect(v.safeParse(RequireCorrectionSchema, { notes: tooLong }).success).toBe(false);
    expect(
      v.safeParse(SaveChecklistItemSchema, {
        category: 'DASHBOARD',
        condition: 'GOOD',
        notes: tooLong,
      }).success,
    ).toBe(false);
  });

  it('preserves nullable, optional, blank, and existing trim semantics', () => {
    expect(v.parse(RequireCorrectionSchema, {})).toEqual({});
    expect(v.parse(RequireCorrectionSchema, { notes: null })).toEqual({ notes: null });
    expect(v.parse(RequireCorrectionSchema, { notes: '  ' })).toEqual({ notes: '  ' });
    expect(v.parse(UpdateExecutionNotesSchema, { notes: '  formatted\n note  ' })).toEqual({
      notes: 'formatted\n note',
    });
    expect(v.parse(UpdateExecutionNotesSchema, { notes: null })).toEqual({ notes: null });
    expect(v.parse(UpdateExecutionNotesSchema, { notes: '  ' })).toEqual({ notes: '' });
    expect(v.safeParse(UpdateExecutionNotesSchema, {}).success).toBe(false);
    expect(
      v.parse(SaveChecklistItemSchema, {
        category: 'DASHBOARD',
        condition: 'GOOD',
        notes: null,
      }).notes,
    ).toBeNull();
  });
});

describe('execution checklist and evidence dimension contracts', () => {
  const checklistItem = (category: string) => ({ category, condition: 'GOOD' });

  it('accepts empty, partial, and complete unique checklists but rejects duplicate categories', () => {
    expect(v.safeParse(SaveChecklistSchema, { items: [] }).success).toBe(true);
    expect(v.safeParse(SaveChecklistSchema, { items: [checklistItem('DASHBOARD')] }).success).toBe(
      true,
    );
    const allCategories = ['DASHBOARD', 'WINDOWS', 'ACCESSORIES', 'TRIMS', 'BODYWORK'];
    expect(
      v.safeParse(SaveChecklistSchema, { items: allCategories.map(checklistItem) }).success,
    ).toBe(true);
    expect(
      v.safeParse(SaveChecklistSchema, {
        items: [checklistItem('DASHBOARD'), checklistItem('DASHBOARD')],
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(SaveChecklistSchema, {
        items: [...allCategories, 'DASHBOARD'].map(checklistItem),
      }).success,
    ).toBe(false);
  });


});
