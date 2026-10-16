import type { ObjectStoragePort } from '../ports.js';
import { ObjectTooLargeError } from './object-too-large.error.js';

export class DevMockStorageClient implements ObjectStoragePort {
  private readonly objects = new Map<
    string,
    { body: Uint8Array; bytes: number; mimeType: string }
  >();

  private static readonly placeholderPng = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  );

  public async createUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    void expiresInSeconds;
    // In mock mode, pre-register the object as if uploaded with default 100KB size
    this.objects.set(key, {
      body: DevMockStorageClient.placeholderPng,
      bytes: DevMockStorageClient.placeholderPng.byteLength,
      mimeType,
    });
    return `http://localhost:9000/mock-upload/${encodeURIComponent(key)}`;
  }

  public async createDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    void expiresInSeconds;
    return `http://localhost:9000/mock-download/${encodeURIComponent(key)}`;
  }

  public async headObject(key: string): Promise<{ bytes: number; mimeType: string } | null> {
    const object = this.objects.get(key);
    return object ? { bytes: object.bytes, mimeType: object.mimeType } : null;
  }

  public async getObject(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key)?.body ?? null;
  }

  public async getObjectLimited(key: string, maxBytes: number): Promise<Uint8Array | null> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new RangeError('maxBytes must be a positive safe integer.');
    }
    const object = this.objects.get(key);
    if (object && object.body.byteLength > maxBytes) throw new ObjectTooLargeError(maxBytes);
    return object?.body ?? null;
  }

  public async putObject(key: string, body: Uint8Array, mimeType: string): Promise<void> {
    this.objects.set(key, { body, bytes: body.byteLength, mimeType });
  }

  public async removeObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
