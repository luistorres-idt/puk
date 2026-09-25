import { randomUUID } from 'node:crypto';

export function createOrderFolio(): string {
  return `OS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
}
