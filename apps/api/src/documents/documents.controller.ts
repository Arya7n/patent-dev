import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsIn, IsString } from "class-validator";
import { asc, eq } from "drizzle-orm";
import { documentChunks, documentPages, documents } from "@patent/db";
import { documentRoles, safeFilename, type DocumentRole } from "@patent/shared";
import { signDownload, verifyDownload } from "@patent/storage";
import { AccessService } from "../access/access.service";
import { Public } from "../auth/public.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/session.guard";
import { SessionGuard } from "../auth/session.guard";
import { ContextService } from "../context/context.service";
import { JobsService } from "../jobs/jobs.service";
import type { Request } from "express";
import { Req } from "@nestjs/common";

class UploadDocumentDto {
  @ApiProperty({ enum: documentRoles })
  @IsString()
  @IsIn([...documentRoles])
  role!: DocumentRole;
}

@ApiTags("documents")
@Controller()
export class DocumentsController {
  constructor(
    private readonly context: ContextService,
    private readonly access: AccessService,
    private readonly jobs: JobsService,
    private readonly sessions: SessionGuard,
  ) {}

  @ApiCookieAuth()
  @Post("projects/:id/documents")
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" }, role: { type: "string" } } } })
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) projectId: string,
    @Body() body: UploadDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("A PDF file is required");
    if (file.mimetype !== "application/pdf" && !file.originalname.toLowerCase().endsWith(".pdf")) {
      throw new BadRequestException("Only PDF files can be uploaded");
    }
    if (file.size > this.context.env.MAX_UPLOAD_BYTES) {
      throw new BadRequestException("File exceeds the upload limit");
    }
    const { project } = await this.access.project(user.id, projectId, "edit");
    const [document] = await this.context.db
      .insert(documents)
      .values({
        organizationId: project.organizationId,
        projectId,
        role: body.role,
        originalFilename: safeFilename(file.originalname),
        storageKey: "pending",
        mimeType: "application/pdf",
        byteSize: file.size,
        status: "uploaded",
        createdBy: user.id,
      })
      .returning();
    const storageKey = `${project.organizationId}/${projectId}/${document.id}.pdf`;
    await this.context.ctx.storage.put(storageKey, file.buffer, "application/pdf");
    const [saved] = await this.context.db
      .update(documents)
      .set({ storageKey, updatedAt: new Date() })
      .where(eq(documents.id, document.id))
      .returning();
    await this.access.audit({
      organizationId: project.organizationId,
      userId: user.id,
      action: "document.upload",
      entityType: "document",
      entityId: document.id,
    });
    return saved;
  }

  @ApiCookieAuth()
  @Get("projects/:id/documents")
  async list(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) projectId: string) {
    await this.access.project(user.id, projectId, "read");
    return this.context.db.select().from(documents).where(eq(documents.projectId, projectId)).orderBy(asc(documents.createdAt));
  }

  @ApiCookieAuth()
  @Get("documents/:id")
  async get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.loadReadable(user.id, id);
  }

  @ApiCookieAuth()
  @Post("documents/:id/process")
  async process(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    const document = await this.loadEditable(user.id, id);
    await this.context.db.update(documents).set({ status: "queued", error: null, updatedAt: new Date() }).where(eq(documents.id, id));
    const job = await this.jobs.enqueue({
      organizationId: document.organizationId,
      projectId: document.projectId,
      documentId: document.id,
      type: "process_document",
    });
    await this.access.audit({
      organizationId: document.organizationId,
      userId: user.id,
      action: "document.process",
      entityType: "document",
      entityId: document.id,
    });
    return { jobId: job.id, status: job.status };
  }

  @ApiCookieAuth()
  @Post("documents/:id/extract-claims")
  async extractClaims(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    const document = await this.loadEditable(user.id, id);
    const job = await this.jobs.enqueue({
      organizationId: document.organizationId,
      projectId: document.projectId,
      documentId: document.id,
      type: "extract_claims",
    });
    return { jobId: job.id, status: job.status };
  }

  @ApiCookieAuth()
  @Get("documents/:id/pages")
  async pages(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.loadReadable(user.id, id);
    return this.context.db.select().from(documentPages).where(eq(documentPages.documentId, id)).orderBy(asc(documentPages.pageNumber));
  }

  @ApiCookieAuth()
  @Get("documents/:id/chunks")
  async chunks(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.loadReadable(user.id, id);
    return this.context.db.select().from(documentChunks).where(eq(documentChunks.documentId, id)).orderBy(asc(documentChunks.chunkIndex));
  }

  @ApiCookieAuth()
  @Get("documents/:id/signed-url")
  async signedUrl(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    const document = await this.loadReadable(user.id, id);
    const expires = Date.now() + 5 * 60 * 1000;
    const sig = signDownload(this.context.env.AUTH_SECRET, document.storageKey, expires);
    return { url: `/documents/${document.id}/file?expires=${expires}&sig=${encodeURIComponent(sig)}`, expires };
  }

  @Public()
  @Get("documents/:id/file")
  async file(
    @Req() request: Request,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("expires") expires?: string,
    @Query("sig") sig?: string,
  ) {
    const [document] = await this.context.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!document) throw new BadRequestException("Document not found");
    const expiry = Number(expires);
    const signed = sig ? verifyDownload(this.context.env.AUTH_SECRET, document.storageKey, expiry, sig, Date.now()) : false;
    if (!signed) {
      const user = await this.sessions.userFromRequest(request);
      if (!user) throw new BadRequestException("Sign in required");
      await this.access.project(user.id, document.projectId, "read");
    }
    const bytes = await this.context.ctx.storage.get(document.storageKey);
    return new StreamableFile(bytes, {
      type: "application/pdf",
      disposition: `inline; filename="${safeFilename(document.originalFilename)}"`,
    });
  }

  private async loadReadable(userId: string, id: string) {
    const [document] = await this.context.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!document) throw new BadRequestException("Document not found");
    await this.access.project(userId, document.projectId, "read");
    return document;
  }

  private async loadEditable(userId: string, id: string) {
    const [document] = await this.context.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!document) throw new BadRequestException("Document not found");
    await this.access.project(userId, document.projectId, "edit");
    return document;
  }
}
