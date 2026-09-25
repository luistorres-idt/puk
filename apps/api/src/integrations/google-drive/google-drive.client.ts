import { Readable } from 'node:stream';
import { google, type drive_v3 } from 'googleapis';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface GoogleDriveClientConfig {
  clientEmail: string;
  privateKey: string;
  sharedDriveId: string;
  timeoutMs?: number;
}

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  parentId: string | null;
  sizeBytes: number | null;
}

export interface DriveUpload {
  id?: string;
  parentId: string;
  name: string;
  mimeType: string;
  body: Uint8Array;
}

function isHttpError(error: unknown, status: number): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  return (
    Number(candidate.code) === status ||
    Number(candidate.status) === status ||
    Number(candidate.response?.status) === status
  );
}

function requiredId(id: string | null | undefined, operation: string): string {
  if (!id) throw new Error(`Google Drive did not return an ID for ${operation}.`);
  return id;
}

/**
 * Low-level Drive operations. Logical identity and concurrency control belong to the caller's
 * database mapping, not to visible folder names (which Drive does not make unique).
 */
export class GoogleDriveClient {
  private readonly drive: drive_v3.Drive;
  private readonly sharedDriveId: string;

  public constructor(config: GoogleDriveClientConfig, drive?: drive_v3.Drive) {
    if (!config.clientEmail.trim() || !config.privateKey.trim() || !config.sharedDriveId.trim()) {
      throw new Error('Google Drive service account and shared drive must be configured.');
    }
    this.sharedDriveId = config.sharedDriveId;
    if (drive) {
      this.drive = drive;
      return;
    }

    const auth = new google.auth.JWT({
      email: config.clientEmail,
      key: config.privateKey.replaceAll('\\n', '\n'),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.drive = google.drive({ version: 'v3', auth, timeout: config.timeoutMs ?? 15_000 });
  }

  public async generateId(): Promise<string> {
    const response = await this.drive.files.generateIds({
      count: 1,
      space: 'drive',
      type: 'files',
    });
    return requiredId(response.data.ids?.[0], 'ID reservation');
  }

  public async getFolder(id: string): Promise<DriveFolder | null> {
    const file = await this.headFile(id);
    if (!file) return null;
    if (file.mimeType !== FOLDER_MIME_TYPE) {
      throw new Error(`Google Drive item ${id} is not a folder.`);
    }
    return { id: file.id, name: file.name, parentId: file.parentId };
  }

  public async createFolder(input: {
    id: string;
    name: string;
    parentId: string;
  }): Promise<DriveFolder> {
    try {
      const response = await this.drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          id: input.id,
          name: input.name,
          mimeType: FOLDER_MIME_TYPE,
          parents: [input.parentId],
        },
        fields: 'id,name,parents,driveId,mimeType',
      });
      if (response.data.id !== input.id) {
        throw new Error('Google Drive returned a different folder ID than requested.');
      }
      if (response.data.driveId !== this.sharedDriveId) {
        throw new Error('Google Drive created a folder outside the configured shared drive.');
      }
      return { id: input.id, name: input.name, parentId: input.parentId };
    } catch (error) {
      if (!isHttpError(error, 409)) throw error;
      const existing = await this.getFolder(input.id);
      if (existing?.name !== input.name || existing.parentId !== input.parentId) {
        throw new Error(`Google Drive folder ID ${input.id} belongs to a different folder.`, {
          cause: error,
        });
      }
      return existing;
    }
  }

  public async uploadFile(input: DriveUpload): Promise<{ id: string; reused?: true }> {
    try {
      const response = await this.drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          ...(input.id ? { id: input.id } : {}),
          name: input.name,
          parents: [input.parentId],
        },
        media: {
          mimeType: input.mimeType,
          body: Readable.from([Buffer.from(input.body)]),
        },
        fields: 'id,driveId',
      });
      if (response.data.driveId !== this.sharedDriveId) {
        throw new Error('Google Drive uploaded a file outside the configured shared drive.');
      }
      const id = requiredId(response.data.id, 'file upload');
      if (input.id && id !== input.id) {
        throw new Error('Google Drive returned a different file ID than requested.');
      }
      return { id };
    } catch (error) {
      if (!input.id || !isHttpError(error, 409)) throw error;
      const existing = await this.headFile(input.id);
      if (
        existing?.name !== input.name ||
        existing.parentId !== input.parentId ||
        existing.mimeType !== input.mimeType
      ) {
        throw new Error(`Google Drive file ID ${input.id} belongs to a different file.`, {
          cause: error,
        });
      }
      return { id: input.id, reused: true };
    }
  }

  public async headFile(id: string): Promise<DriveFileMetadata | null> {
    try {
      const response = await this.drive.files.get({
        fileId: id,
        supportsAllDrives: true,
        fields: 'id,name,mimeType,parents,driveId,size,trashed',
      });
      const file = response.data;
      if (file.trashed) return null;
      if (file.driveId !== this.sharedDriveId) {
        throw new Error(`Google Drive item ${id} is outside the configured shared drive.`);
      }
      return {
        id: requiredId(file.id, 'file metadata'),
        name: file.name ?? '',
        mimeType: file.mimeType ?? 'application/octet-stream',
        parentId: file.parents?.[0] ?? null,
        sizeBytes: file.size === undefined || file.size === null ? null : Number(file.size),
      };
    } catch (error) {
      if (isHttpError(error, 404)) return null;
      throw error;
    }
  }

  public async getFile(id: string): Promise<Uint8Array | null> {
    if (!(await this.headFile(id))) return null;
    try {
      const response = await this.drive.files.get(
        { fileId: id, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      return new Uint8Array(response.data as ArrayBuffer);
    } catch (error) {
      if (isHttpError(error, 404)) return null;
      throw error;
    }
  }
}
