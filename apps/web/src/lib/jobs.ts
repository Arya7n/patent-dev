import { api } from "./api";
import type { Job } from "./types";

export async function waitForJob(
  jobId: string,
  timeoutMs = 180_000,
  onTick?: (job: Job, elapsedMs: number) => void,
): Promise<Job> {
  const started = Date.now();
  for (;;) {
    const job = await api<Job | null>(`/jobs/${jobId}`);
    const elapsedMs = Date.now() - started;
    if (!job) throw new Error("The job disappeared before it finished.");
    onTick?.(job, elapsedMs);
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error || "The job failed.");
    if (elapsedMs > timeoutMs) {
      throw new Error(
        job.status === "queued"
          ? "The job is still queued. The background worker is not running. Start it with pnpm dev:worker."
          : "This is still running. Leave the page open and it will update when the worker finishes.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
