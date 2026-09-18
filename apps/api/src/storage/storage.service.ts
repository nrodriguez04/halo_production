import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { IntegrationUnavailableException } from '../integrations/integration-unavailable.exception';

export interface UploadResult {
  key: string;
  bucket: string;
  etag?: string;
  url: string;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified?: Date;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor() {
    this.endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    this.bucket = process.env.S3_BUCKET || 'halo-documents';

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });
  }

  async onModuleInit() {
    try {
      await this.ensureBucket();
    } catch (err: any) {
      this.logger.warn(
        `Could not ensure bucket "${this.bucket}": ${err.message}. Storage may not work until MinIO is available.`,
      );
    }
  }

  private async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" exists`);
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Created bucket "${this.bucket}"`);
      } else {
        throw err;
      }
    }
  }

  buildKey(tenantId: string, category: string, filename: string): string {
    return `${tenantId}/${category}/${filename}`;
  }

  /**
   * Classifies S3/MinIO failures.
   *
   * An unreachable bucket or a bad access key is an operational state, not a
   * bug in the request, but the raw SDK error surfaced as 500 Internal server
   * error - identical to a genuine crash. Connection and credential failures
   * become 503 with the cause named; everything else propagates unchanged.
   */
  private async s3<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err: any) {
      const code = err?.Code || err?.name || err?.code || '';

      if (
        ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(
          err?.code,
        ) ||
        code === 'TimeoutError'
      ) {
        throw new IntegrationUnavailableException(
          's3',
          'UPSTREAM_ERROR',
          `${this.endpoint} unreachable (${err?.code || code})`,
        );
      }

      if (
        [
          'InvalidAccessKeyId',
          'SignatureDoesNotMatch',
          'AccessDenied',
        ].includes(code)
      ) {
        throw new IntegrationUnavailableException(
          's3',
          'REJECTED_CREDENTIALS',
          code,
        );
      }

      throw err;
    }
  }

  async upload(
    tenantId: string,
    category: string,
    filename: string,
    body: Buffer | Readable | string,
    contentType: string = 'application/octet-stream',
  ): Promise<UploadResult> {
    const key = this.buildKey(tenantId, category, filename);

    const result = await this.s3(() =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          Metadata: {
            'x-tenant-id': tenantId,
            'x-category': category,
          },
        }),
      ),
    );

    return {
      key,
      bucket: this.bucket,
      etag: result.ETag,
      url: `${this.endpoint}/${this.bucket}/${key}`,
    };
  }

  async download(
    key: string,
  ): Promise<{ body: Readable; contentType?: string }> {
    const result = await this.s3(() =>
      this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })),
    );

    return {
      body: result.Body as Readable,
      contentType: result.ContentType,
    };
  }

  async delete(key: string): Promise<void> {
    await this.s3(() =>
      this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      ),
    );
  }

  async list(tenantId: string, category?: string): Promise<StorageObject[]> {
    const prefix = category ? `${tenantId}/${category}/` : `${tenantId}/`;

    const result = await this.s3(() =>
      this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }),
      ),
    );

    return (result.Contents || []).map((obj) => ({
      key: obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified,
    }));
  }
}
