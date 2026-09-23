import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { drive_v3 } from 'googleapis';
import { GoogleDriveClient } from './google-drive.client.js';

const files = {
  generateIds: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

const config = {
  clientEmail: 'drive-service@example.invalid',
  privateKey: 'test-only-key',
  sharedDriveId: 'shared-drive-id',
};

function createClient(): GoogleDriveClient {
  return new GoogleDriveClient(config, { files } as unknown as drive_v3.Drive);
}

function notFound() {
  return Object.assign(new Error('Not found'), { code: 404 });
}

describe('GoogleDriveClient', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires a dedicated identity and shared drive configuration', () => {
    expect(
      () =>
        new GoogleDriveClient({ ...config, sharedDriveId: '' }, {
          files,
        } as unknown as drive_v3.Drive),
    ).toThrow('Google Drive service account and shared drive must be configured.');
  });

  it('generates an ID that a caller can reserve before folder creation', async () => {
    files.generateIds.mockResolvedValue({ data: { ids: ['reserved-id'] } });
    await expect(createClient().generateId()).resolves.toBe('reserved-id');
    expect(files.generateIds).toHaveBeenCalledWith({ count: 1, space: 'drive', type: 'files' });
  });

  it('looks up folders only under the requested parent in the configured shared drive', async () => {
    files.list.mockResolvedValue({
      data: {
        files: [
          { id: 'folder-id', name: "O'Brien", parents: ['parent-id'], driveId: 'shared-drive-id' },
        ],
      },
    });
    await expect(createClient().findFolder('parent-id', "O'Brien")).resolves.toEqual({
      id: 'folder-id',
      name: "O'Brien",
      parentId: 'parent-id',
    });
    expect(files.list).toHaveBeenCalledWith(
      expect.objectContaining({
        corpora: 'drive',
        driveId: 'shared-drive-id',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        q: "'parent-id' in parents and name = 'O\\'Brien' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      }),
    );
  });

  it('rejects ambiguous visible folder names instead of choosing one ID', async () => {
    files.list.mockResolvedValueOnce({
      data: {
        files: [{ id: 'first', name: 'VIN', parents: ['parent-id'] }],
        nextPageToken: 'next',
      },
    });
    files.list.mockResolvedValueOnce({
      data: { files: [{ id: 'second', name: 'VIN', parents: ['parent-id'] }] },
    });
    await expect(createClient().findFolder('parent-id', 'VIN')).rejects.toThrow(
      'Ambiguous Google Drive folder',
    );
    expect(files.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageToken: 'next' }));
  });

  it('creates a folder with the reserved ID and exact parent', async () => {
    files.create.mockResolvedValue({ data: { id: 'reserved-id', driveId: 'shared-drive-id' } });
    const input = { id: 'reserved-id', name: 'VIN-123', parentId: 'client-folder' };
    await expect(createClient().createFolder(input)).resolves.toEqual({
      id: 'reserved-id',
      name: 'VIN-123',
      parentId: 'client-folder',
    });
    expect(files.create).toHaveBeenCalledWith({
      supportsAllDrives: true,
      requestBody: {
        id: 'reserved-id',
        name: 'VIN-123',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['client-folder'],
      },
      fields: 'id,name,parents,driveId,mimeType',
    });
  });

  it('treats a 409 as a successful retry only for the same reserved folder identity', async () => {
    files.create.mockRejectedValue(Object.assign(new Error('Conflict'), { code: 409 }));
    files.get.mockResolvedValue({
      data: {
        id: 'reserved-id',
        name: 'VIN-123',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['client-folder'],
        driveId: 'shared-drive-id',
      },
    });
    const client = createClient();
    await expect(
      client.createFolder({ id: 'reserved-id', name: 'VIN-123', parentId: 'client-folder' }),
    ).resolves.toEqual({ id: 'reserved-id', name: 'VIN-123', parentId: 'client-folder' });
    await expect(
      client.createFolder({ id: 'reserved-id', name: 'VIN-123', parentId: 'other-client' }),
    ).rejects.toThrow('belongs to a different folder');
  });

  it('uploads binary content without a public permission or download URL', async () => {
    files.create.mockResolvedValue({ data: { id: 'file-id', driveId: 'shared-drive-id' } });
    const body = Uint8Array.from([1, 2, 3]);
    await expect(
      createClient().uploadFile({
        parentId: 'order-folder',
        name: 'evidence.jpg',
        mimeType: 'image/jpeg',
        body,
      }),
    ).resolves.toEqual({ id: 'file-id' });
    const request = files.create.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      supportsAllDrives: true,
      requestBody: { name: 'evidence.jpg', parents: ['order-folder'] },
      media: { mimeType: 'image/jpeg' },
    });
    const chunks: Buffer[] = [];
    for await (const chunk of request.media.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(body));
  });

  it('retries a reserved upload only when the existing file has the exact expected identity', async () => {
    files.create.mockRejectedValue(Object.assign(new Error('Conflict'), { code: 409 }));
    files.get.mockResolvedValue({
      data: {
        id: 'reserved-id',
        name: 'evidence.jpg',
        mimeType: 'image/jpeg',
        parents: ['order-folder'],
        driveId: 'shared-drive-id',
      },
    });
    const input = {
      id: 'reserved-id',
      parentId: 'order-folder',
      name: 'evidence.jpg',
      mimeType: 'image/jpeg',
      body: Uint8Array.from([1]),
    };
    await expect(createClient().uploadFile(input)).resolves.toEqual({
      id: 'reserved-id',
      reused: true,
    });
    await expect(createClient().uploadFile({ ...input, parentId: 'other-folder' })).rejects.toThrow(
      'belongs to a different file',
    );
    expect(files.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { id: 'reserved-id', name: 'evidence.jpg', parents: ['order-folder'] },
      }),
    );
  });

  it('reads, downloads, and deletes only files in the configured shared drive', async () => {
    files.get.mockImplementation(async (_params: unknown, options?: { responseType?: string }) => {
      if (options?.responseType === 'arraybuffer') {
        return { data: Uint8Array.from([4, 5]).buffer };
      }
      return {
        data: {
          id: 'file-id',
          name: 'report.pdf',
          mimeType: 'application/pdf',
          parents: ['order-folder'],
          size: '2',
          driveId: 'shared-drive-id',
        },
      };
    });
    files.delete.mockResolvedValue({});
    const client = createClient();
    await expect(client.headFile('file-id')).resolves.toEqual({
      id: 'file-id',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      parentId: 'order-folder',
      sizeBytes: 2,
    });
    await expect(client.getFile('file-id')).resolves.toEqual(Uint8Array.from([4, 5]));
    await client.deleteFile('file-id');
    expect(files.delete).toHaveBeenCalledWith({ fileId: 'file-id', supportsAllDrives: true });
    expect(files.get).toHaveBeenCalledWith(
      { fileId: 'file-id', alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
  });

  it('returns null for missing files and refuses IDs outside the shared drive', async () => {
    files.get.mockRejectedValueOnce(notFound());
    const client = createClient();
    await expect(client.getFile('missing')).resolves.toBeNull();
    files.get.mockResolvedValueOnce({
      data: { id: 'foreign', driveId: 'another-drive', mimeType: 'image/png' },
    });
    await expect(client.deleteFile('foreign')).rejects.toThrow(
      'outside the configured shared drive',
    );
    expect(files.delete).not.toHaveBeenCalled();
  });
});
