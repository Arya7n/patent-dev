import path from "node:path";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { createDb } from "@patent/db";
import { createAi, DEFAULT_COSTS, findRepoRoot, parseRuntimeEnv, runQueuedJob } from "@patent/pipeline";
import { JOB_QUEUE } from "@patent/shared";
import { createStorage } from "@patent/storage";

const env = parseRuntimeEnv(process.env);
const root = findRepoRoot();
const { db, sql } = createDb(env.DATABASE_URL);
const localPath = path.isAbsolute(env.STORAGE_LOCAL_PATH)
  ? env.STORAGE_LOCAL_PATH
  : path.resolve(root, env.STORAGE_LOCAL_PATH);
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const ctx = {
  db,
  storage: createStorage({
    provider: env.STORAGE_PROVIDER,
    localPath,
    bucket: env.S3_BUCKET,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
  }),
  ai: createAi(env),
  pythonBin: env.PYTHON_BIN,
  repoRoot: root,
  costs: DEFAULT_COSTS,
  dimensions: env.EMBEDDING_DIMENSIONS,
};

const worker = new Worker(
  JOB_QUEUE,
  async (job) => {
    await runQueuedJob(ctx, String(job.data.jobId));
  },
  { connection, concurrency: 2 },
);

worker.on("failed", (job, error) => {
  console.error(JSON.stringify({ level: "error", bullJobId: job?.id, message: error.message }));
});

async function shutdown() {
  await worker.close();
  await connection.quit();
  await sql.end();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

console.log(JSON.stringify({ level: "info", status: "worker_started", queue: JOB_QUEUE }));
