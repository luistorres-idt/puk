import type { ObjectStoragePort } from '../ports.js';

export class DevMockStorageClient implements ObjectStoragePort {
  private readonly objects = new Map<string, { bytes: number; mimeType: string }>();

  public async createUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    void expiresInSeconds;
    // In mock mode, pre-register the object as if uploaded with default 100KB size
    this.objects.set(key, { bytes: 102400, mimeType });
    return `http://localhost:9000/mock-upload/${encodeURIComponent(key)}`;
  }

  public async createDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    void expiresInSeconds;
    return `http://localhost:9000/mock-download/${encodeURIComponent(key)}`;
  }

  public async headObject(key: string): Promise<{ bytes: number; mimeType: string } | null> {
    return this.objects.get(key) ?? null;
  }

  public async removeObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
