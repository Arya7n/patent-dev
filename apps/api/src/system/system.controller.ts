import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { count, eq, sql } from "drizzle-orm";
import { aiUsage, documents, processingJobs } from "@patent/db";
import { AccessService } from "../access/access.service";
import { Public } from "../auth/public.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/session.guard";
import { ContextService } from "../context/context.service";

@ApiTags("system")
@Controller()
export class SystemController {
  constructor(
    private readonly context: ContextService,
    private readonly access: AccessService,
  ) {}

  @Public()
  @Get("health")
  health() {
    return { ok: true };
  }

  @ApiCookieAuth()
  @Get("runtime")
  runtime() {
    return {
      aiProvider: this.context.env.AI_PROVIDER,
      activeAiProvider: this.context.ctx.ai.provider,
      aiConfigured: this.context.ctx.ai.configured,
      chatModel: this.context.ctx.ai.chatModel,
      embeddingModel: this.context.ctx.ai.embeddingModel,
      storageProvider: this.context.env.STORAGE_PROVIDER,
    };
  }

  @ApiCookieAuth()
  @Get("usage")
  async usage(@CurrentUser() user: AuthUser) {
    const membership = await this.access.organizationId(user.id);
    const [usage] = await this.context.db
      .select({
        requests: count(),
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
        estimatedCostUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)`,
      })
      .from(aiUsage)
      .where(eq(aiUsage.organizationId, membership.organizationId));
    const [processed] = await this.context.db
      .select({ documents: count() })
      .from(documents)
      .where(eq(documents.organizationId, membership.organizationId));
    return {
      requests: usage?.requests ?? 0,
      inputTokens: Number(usage?.inputTokens ?? 0),
      outputTokens: Number(usage?.outputTokens ?? 0),
      estimatedCostUsd: Number(usage?.estimatedCostUsd ?? 0),
      documents: processed?.documents ?? 0,
    };
  }

  @ApiCookieAuth()
  @Get("jobs/:id")
  async job(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    const [job] = await this.context.db.select().from(processingJobs).where(eq(processingJobs.id, id)).limit(1);
    if (!job) return null;
    await this.access.project(user.id, job.projectId, "read");
    return job;
  }
}
