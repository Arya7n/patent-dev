import { Injectable, OnModuleDestroy } from "@nestjs/common";
import path from "node:path";
import { createDb } from "@patent/db";
import {
  createAi,
  DEFAULT_COSTS,
  findRepoRoot,
  parseRuntimeEnv,
  type PipelineContext,
} from "@patent/pipeline";
import { createStorage } from "@patent/storage";

@Injectable()
export class ContextService implements OnModuleDestroy {
  readonly env: ReturnType<typeof parseRuntimeEnv>;
  readonly ctx: PipelineContext;
  private readonly sql: { end: () => Promise<void> };

  constructor() {
    this.env = parseRuntimeEnv(process.env);
    const root = findRepoRoot();
    const connection = createDb(this.env.DATABASE_URL);
    this.sql = connection.sql;
    const localPath = path.isAbsolute(this.env.STORAGE_LOCAL_PATH)
      ? this.env.STORAGE_LOCAL_PATH
      : path.resolve(root, this.env.STORAGE_LOCAL_PATH);
    this.ctx = {
      db: connection.db,
      storage: createStorage({
        provider: this.env.STORAGE_PROVIDER,
        localPath,
        bucket: this.env.S3_BUCKET,
        endpoint: this.env.S3_ENDPOINT,
        region: this.env.S3_REGION,
        accessKeyId: this.env.S3_ACCESS_KEY_ID,
        secretAccessKey: this.env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: this.env.S3_FORCE_PATH_STYLE !== "false",
      }),
      ai: createAi(this.env),
      pythonBin: this.env.PYTHON_BIN,
      repoRoot: root,
      costs: DEFAULT_COSTS,
      dimensions: this.env.EMBEDDING_DIMENSIONS,
    };
  }

  get db() {
    return this.ctx.db;
  }

  async onModuleDestroy() {
    await this.sql.end();
  }
}
