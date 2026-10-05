import { generateUuid } from '@/shared/utils/uuid.js';

export function createEvidenceUploadRetryKeys() {
  const pendingUploadKeys = new Map<string, string>();

  function retryKeyFor(orderId: string, unitId: string, file: File): string {
    return `puk:evidence-upload:${orderId}:${unitId}:${file.name}:${file.size}:${file.lastModified}`;
  }

  function keyFor(orderId: string, unitId: string, file: File): string {
    const retryKey = retryKeyFor(orderId, unitId, file);
    let savedKey: string | null = null;
    try {
      savedKey = sessionStorage.getItem(retryKey);
    } catch {
      // Private browsing may disable session storage; in-memory retry still works.
    }
    const key = pendingUploadKeys.get(retryKey) ?? savedKey ?? generateUuid();
    pendingUploadKeys.set(retryKey, key);
    try {
      sessionStorage.setItem(retryKey, key);
    } catch {
      // The server-side reservation remains authoritative.
    }
    return key;
  }

  function clear(orderId: string, unitId: string, file: File): void {
    const retryKey = retryKeyFor(orderId, unitId, file);
    pendingUploadKeys.delete(retryKey);
    try {
      sessionStorage.removeItem(retryKey);
    } catch {
      // No persistent browser state to clear.
    }
  }

  return { keyFor, clear };
}
