import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { processingJobs } from "@patent/db";
import { JOB_QUEUE, type JobType } from "@patent/shared";
import { ContextService } from "../context/context.service";

@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly queue: Queue;
  private readonly connection: IORedis;

  constructor(private readonly context: ContextService) {
    this.connection = new IORedis(this.context.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(JOB_QUEUE, { connection: this.connection });
  }

  async enqueue(input: {
    organizationId: string;
    projectId: string;
    type: JobType;
    documentId?: string;
    claimId?: string;
    claimElementId?: string;
    reportId?: string;
  }) {
    const [job] = await this.context.db
      .insert(processingJobs)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        type: input.type,
        documentId: input.documentId,
        claimId: input.claimId,
        claimElementId: input.claimElementId,
        reportId: input.reportId,
        status: "queued",
      })
      .returning();
    const bullJob = await this.queue.add(
      input.type,
      { jobId: job.id },
      { attempts: 3, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 200, removeOnFail: 200 },
    );
    await this.context.db
      .update(processingJobs)
      .set({ bullJobId: bullJob.id ?? null })
      .where(eq(processingJobs.id, job.id));
    return job;
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
