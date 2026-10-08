import { z } from "zod";

export const runtimeEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(16),
  AUTH_COOKIE_NAME: z.string().default("patent_session"),
  AUTH_CORS_ORIGINS: z.string().default("http://localhost:3000"),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./data/uploads"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("auto"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_FORCE_PATH_STYLE: z.string().optional().default("true"),
  AI_PROVIDER: z.enum(["gemini", "openai", "local"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  PYTHON_BIN: z.string().default("python"),
  API_PORT: z.coerce.number().default(3001),
  MAX_UPLOAD_BYTES: z.coerce.number().default(41_943_040),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function parseRuntimeEnv(source: NodeJS.ProcessEnv): RuntimeEnv {
  const parsed = runtimeEnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${fields}`);
  }
  return parsed.data;
}
