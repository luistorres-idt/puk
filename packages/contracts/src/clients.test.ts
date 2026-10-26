import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { CreateClientSchema, SaveClientEmailSchema, UpdateClientSchema } from './clients.js';

describe('client management contracts', () => {
  it('creates a client with only a trimmed name', () => {
    expect(v.parse(CreateClientSchema, { name: ' Local client ' })).toEqual({
      name: 'Local client',
    });
    expect(v.safeParse(CreateClientSchema, { name: ' ' }).success).toBe(false);
    expect(v.safeParse(CreateClientSchema, { name: 'x'.repeat(201) }).success).toBe(false);
  });
  it('trims names and optional legacy Sheets identifiers', () => {
    expect(v.parse(CreateClientSchema, { clientSheetId: ' C-1 ', name: ' Client ' })).toEqual({
      clientSheetId: 'C-1',
      name: 'Client',
    });
  });
  it('normalizes email before uniqueness checks without DNS validation', () => {
    expect(v.parse(SaveClientEmailSchema, { email: ' Person@Example.invalid ' })).toEqual({
      email: 'person@example.invalid',
    });
  });
  it.each(['', ' ', 'not-an-email', 'a@', 'a b@example.com'])(
    'rejects invalid email %s',
    (email) => {
      expect(v.safeParse(SaveClientEmailSchema, { email }).success).toBe(false);
    },
  );
  it('rejects blank identity/name and immutable identifier updates', () => {
    expect(v.safeParse(CreateClientSchema, { clientSheetId: ' ', name: 'Client' }).success).toBe(
      false,
    );
    expect(v.safeParse(UpdateClientSchema, { name: ' ' }).success).toBe(false);
    expect(
      v.safeParse(UpdateClientSchema, { name: 'Client', clientSheetId: 'OTHER' }).success,
    ).toBe(false);
    expect(v.safeParse(UpdateClientSchema, {}).success).toBe(false);
  });
});
