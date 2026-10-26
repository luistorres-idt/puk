import { describe, expect, it } from 'vitest';

import * as v from 'valibot';
import { CatalogMetadataSchema, isMatchingClient } from './catalogs.js';

describe('client identity matching', () => {
  it('ignores accents, casing, and supported legal suffixes', () => {
    expect(isMatchingClient('Transportes Bull Dog', 'TRANSPORTES BULL DOG S.A. de C.V.')).toBe(
      true,
    );
  });

  it('does not match different companies that share a short name', () => {
    expect(isMatchingClient('ACME', 'ACME Norte')).toBe(false);
  });
});

describe('client catalog availability metadata', () => {
  const metadata = { fetchedAt: '2026-10-26T12:00:00.000Z', total: 0 };
  it('preserves explicit degraded state even when there are no stored clients', () => {
    expect(v.parse(CatalogMetadataSchema, { ...metadata, sheetsAvailable: false })).toEqual({
      ...metadata,
      sheetsAvailable: false,
    });
  });
  it('supports legacy metadata and rejects nonboolean availability', () => {
    expect(v.parse(CatalogMetadataSchema, metadata)).toEqual(metadata);
    expect(
      v.safeParse(CatalogMetadataSchema, { ...metadata, sheetsAvailable: 'false' }).success,
    ).toBe(false);
  });
});
