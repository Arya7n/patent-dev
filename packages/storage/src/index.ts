import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageConfig = {
  provider: "local" | "s3";
  localPath: string;
  bucket?: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
};

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  signedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export function resolveInside(root: string, key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid storage key");
  }
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, normalized);
  const relative = path.relative(rootResolved, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid storage key");
  }
  return full;
}

export function signDownload(secret: string, key: string, expiresAt: number): string {
  const payload = `${expiresAt}.${key}`;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function verifyDownload(
  secret: string,
  key: string,
  expiresAt: number,
  signature: string,
  now: number,
): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  const expected = signDownload(secret, key, expiresAt);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createStorage(config: StorageConfig): ObjectStorage {
  if (config.provider === "s3") {
    return new S3Storage(config);
  }
  return new LocalStorage(config.localPath);
}

class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  async put(key: string, body: Buffer): Promise<void> {
    const full = resolveInside(this.root, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(resolveInside(this.root, key));
  }

  async signedGetUrl(): Promise<string> {
    throw new Error("Local storage uses application download routes");
  }
}

class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: StorageConfig) {
    if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      throw new Error("S3 storage requires bucket and credentials");
    }
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region || "auto",
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error("Empty storage object");
    return Buffer.from(bytes);
  }

  async signedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
