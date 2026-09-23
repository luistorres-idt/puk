import type { ObjectStoragePort } from '../ports.js';

function disabled(): never {
  throw new Error('S3 object storage is disabled while Google Drive is active.');
}

export class DisabledStorageClient implements ObjectStoragePort {
  public createDownloadUrl(): Promise<string> {
    return disabled();
  }
  public createUploadUrl(): Promise<string> {
    return disabled();
  }
  public getObject(): Promise<Uint8Array | null> {
    return disabled();
  }
  public headObject(): Promise<{ bytes: number; mimeType: string } | null> {
    return disabled();
  }
  public putObject(): Promise<void> {
    return disabled();
  }
  public removeObject(): Promise<void> {
    return disabled();
  }
}
