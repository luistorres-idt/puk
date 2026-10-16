import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { ObjectTooLargeError } from './object-too-large.error.js';
import { S3StorageClient } from './s3.client.js';

describe('S3StorageClient.getObjectLimited', () => {
  const makeClient = () => {
    const client = new S3StorageClient({
      endpoint: 'http://localhost:9000',
      region: 'local',
      bucket: 'test',
    });
    const sdk = Reflect.get(client, 'client') as { send: (...args: unknown[]) => Promise<unknown> };
    return { client, sdk };
  };

  it('stops and destroys the stream as soon as the byte limit is crossed', async () => {
    const { client, sdk } = makeClient();
    const stream = Readable.from([Buffer.from([1, 2, 3]), Buffer.from([4, 5, 6])]);
    vi.spyOn(sdk, 'send').mockResolvedValue({ Body: stream });
    await expect(client.getObjectLimited('key', 4)).rejects.toBeInstanceOf(ObjectTooLargeError);
    expect(stream.destroyed).toBe(true);
  });

  it('returns the stream contents when within the byte limit', async () => {
    const { client, sdk } = makeClient();
    vi.spyOn(sdk, 'send').mockResolvedValue({
      Body: Readable.from([Buffer.from([1, 2]), Buffer.from([3])]),
    });
    await expect(client.getObjectLimited('key', 3)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });
});
