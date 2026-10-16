import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStoragePort } from '../ports.js';
import { ObjectTooLargeError } from './object-too-large.error.js';

export interface S3ClientConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

export class S3StorageClient implements ObjectStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  public constructor(config: S3ClientConfig) {
    if ((config.accessKeyId === undefined) !== (config.secretAccessKey === undefined)) {
      throw new Error('S3 access key ID and secret access key must be configured together.');
    }

    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? true,
      ...(config.accessKeyId === undefined
        ? {}
        : {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey!,
            },
          }),
    });
  }

  public async createUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  public async createDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  public async headObject(key: string): Promise<{ bytes: number; mimeType: string } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return {
        bytes: response.ContentLength ?? 0,
        mimeType: response.ContentType ?? 'application/octet-stream',
      };
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  public async getObject(key: string): Promise<Uint8Array | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return response.Body ? await response.Body.transformToByteArray() : null;
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  public async getObjectLimited(key: string, maxBytes: number): Promise<Uint8Array | null> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new RangeError('maxBytes must be a positive safe integer.');
    }
    let body: unknown;
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      body = response.Body;
      if (!body) return null;

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        totalBytes += bytes.byteLength;
        if (totalBytes > maxBytes) {
          await cancelBody(body);
          throw new ObjectTooLargeError(maxBytes);
        }
        chunks.push(bytes);
      }
      const result = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return result;
    } catch (err: unknown) {
      await cancelBody(body);
      if (err instanceof ObjectTooLargeError) throw err;
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  public async putObject(key: string, body: Uint8Array, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );
  }

  public async removeObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

async function cancelBody(body: unknown): Promise<void> {
  if (!body || typeof body !== 'object') return;
  const stream = body as { destroy?: () => void; cancel?: () => Promise<void> | void };
  if (typeof stream.destroy === 'function') {
    stream.destroy();
  } else if (typeof stream.cancel === 'function') {
    await stream.cancel();
  }
}
