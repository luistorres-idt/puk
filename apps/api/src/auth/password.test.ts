import { describe, expect, it } from 'vitest';

import { assertPasswordPolicy, hashPassword, verifyPassword } from './password.js';

describe('passwords', () => {
  it('hashes with Argon2id and verifies without exposing the password', async () => {
    const hash = await hashPassword('a sufficiently long password');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, 'a sufficiently long password')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('enforces the configured minimum length', () => {
    expect(() => assertPasswordPolicy('short', { minimumLength: 12 })).toThrow();
  });
});
