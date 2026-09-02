import { argon2id, hash, verify } from 'argon2';

export interface PasswordPolicy {
  minimumLength: number;
}

export function assertPasswordPolicy(password: string, policy: PasswordPolicy): void {
  if (password.length < policy.minimumLength) {
    throw new Error(`Password must contain at least ${policy.minimumLength} characters.`);
  }
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, { memoryCost: 19_456, parallelism: 1, timeCost: 2, type: argon2id });
}

export function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  return verify(hashValue, password);
}
