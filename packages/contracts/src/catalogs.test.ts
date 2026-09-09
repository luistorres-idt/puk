import { describe, expect, it } from 'vitest';

import { isMatchingClient } from './catalogs.js';

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
