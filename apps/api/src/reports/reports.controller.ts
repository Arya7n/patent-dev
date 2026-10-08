import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, StreamableFile } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import { eq } from "drizzle-orm";
import { reports } from "@patent/db";
import { safeFilename } from "@patent/shared";
import { AccessService } from "../access/access.service";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/session.guard";
import { ContextService } from "../context/context.service";
import { JobsService } from "../jobs/jobs.service";

class CreateReportDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;
}

@ApiTags("reports")
@ApiCookieAuth()
@Controller()
export class ReportsController {
  constructor(
    private readonly context: ContextService,
    private readonly access: AccessService,
    private readonly jobs: JobsService,
  ) {}

  @Post("projects/:id/reports")
  async create(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) projectId: string,
    @Body() body: CreateReportDto,
  ) {
    const { project } = await this.access.project(user.id, projectId, "edit");
    const [report] = await this.context.db
      .insert(reports)
      .values({
        projectId,
        title: body.title.trim(),
        status: "queued",
        createdBy: user.id,
      })
      .returning();
    const job = await this.jobs.enqueue({
      organizationId: project.organizationId,
      projectId,
      reportId: report.id,
      type: "generate_report",
    });
    await this.access.audit({
      organizationId: project.organizationId,
      userId: user.id,
      action: "report.generate",
      entityType: "report",
      entityId: report.id,
    });
    return { report, jobId: job.id };
  }

  @Get("projects/:id/reports")
  async list(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) projectId: string) {
    await this.access.project(user.id, projectId, "read");
    return this.context.db.select().from(reports).where(eq(reports.projectId, projectId));
  }

  @Get("reports/:id")
  async get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.load(user.id, id);
  }

  @Get("reports/:id/download")
  async download(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("format") format?: string,
  ) {
    const report = await this.load(user.id, id);
    const kind = format === "pdf" ? "pdf" : "docx";
    const key = kind === "pdf" ? report.pdfStorageKey : report.docxStorageKey;
    if (!key || report.status !== "completed") throw new BadRequestException("Report file is not ready");
    const bytes = await this.context.ctx.storage.get(key);
    const filename = safeFilename(`${report.title}.${kind}`);
    return new StreamableFile(bytes, {
      type: kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      disposition: `attachment; filename="${filename}"`,
    });
  }

  private async load(userId: string, id: string) {
    const [report] = await this.context.db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!report) throw new BadRequestException("Report not found");
    await this.access.project(userId, report.projectId, "read");
    return report;
  }
}
