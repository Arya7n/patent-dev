import { api } from "./api";
import type { Job } from "./types";

export async function waitForJob(jobId: string, timeoutMs = 180_000): Promise<Job> {
  const started = Date.now();
  for (;;) {
    const job = await api<Job | null>(`/jobs/${jobId}`);
    if (!job) throw new Error("The job disappeared before it finished.");
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error || "The job failed.");
    if (Date.now() - started > timeoutMs) {
      throw new Error("This is still running. The page will keep updating when it finishes.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
