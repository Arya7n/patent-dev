import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { and, asc, eq, inArray } from "drizzle-orm";
import { claimElementEvidence, claimElements, claims } from "@patent/db";
import { claimElementTypes, type ClaimElementType } from "@patent/shared";
import { AccessService } from "../access/access.service";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/session.guard";
import { ContextService } from "../context/context.service";
import { JobsService } from "../jobs/jobs.service";

class CreateClaimDto {
  @ApiProperty()
  @IsUUID()
  documentId!: string;

  @ApiProperty()
  @IsInt()
  claimNumber!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isIndependent?: boolean;
}

class ElementDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional({ enum: claimElementTypes })
  @IsOptional()
  @IsIn([...claimElementTypes])
  type?: ClaimElementType;
}

class ReorderDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

class MergeDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;
}

@ApiTags("claims")
@ApiCookieAuth()
@Controller()
export class ClaimsController {
  constructor(
    private readonly context: ContextService,
    private readonly access: AccessService,
    private readonly jobs: JobsService,
  ) {}

  @Get("projects/:id/claims")
  async list(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) projectId: string) {
    await this.access.project(user.id, projectId, "read");
    const rows = await this.context.db.select().from(claims).where(eq(claims.projectId, projectId)).orderBy(asc(claims.sortOrder));
    const elements = rows.length
      ? await this.context.db
          .select()
          .from(claimElements)
          .where(inArray(claimElements.claimId, rows.map((claim) => claim.id)))
          .orderBy(asc(claimElements.sortOrder))
      : [];
    return rows.map((claim) => ({
      ...claim,
      elements: elements.filter((element) => element.claimId === claim.id),
    }));
  }

  @Post("projects/:id/claims")
  async create(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) projectId: string,
    @Body() body: CreateClaimDto,
  ) {
    await this.access.project(user.id, projectId, "edit");
    const existing = await this.context.db.select().from(claims).where(eq(claims.projectId, projectId));
    const [claim] = await this.context.db
      .insert(claims)
      .values({
        projectId,
        documentId: body.documentId,
        claimNumber: body.claimNumber,
        text: body.text.trim(),
        isIndependent: body.isIndependent ?? true,
        sortOrder: existing.length,
        source: "analyst",
      })
      .returning();
    return claim;
  }

  @Post("claims/:id/decompose")
  async decompose(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    const claim = await this.loadClaim(user.id, id, "edit");
    const project = await this.access.project(user.id, claim.projectId, "edit");
    const job = await this.jobs.enqueue({
      organizationId: project.project.organizationId,
      projectId: claim.projectId,
      claimId: claim.id,
      type: "decompose_claim",
    });
    return { jobId: job.id, status: job.status };
  }

  @Post("claims/:id/elements")
  async addElement(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ElementDto,
  ) {
    await this.loadClaim(user.id, id, "edit");
    const existing = await this.context.db.select().from(claimElements).where(eq(claimElements.claimId, id));
    const [element] = await this.context.db
      .insert(claimElements)
      .values({
        claimId: id,
        elementKey: `E${existing.length + 1}`,
        text: body.text.trim(),
        elementType: body.type ?? "other",
        sortOrder: existing.length,
      })
      .returning();
    return element;
  }

  @Post("claims/:id/elements/reorder")
  async reorder(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReorderDto,
  ) {
    await this.loadClaim(user.id, id, "edit");
    for (const [index, elementId] of body.ids.entries()) {
      await this.context.db
        .update(claimElements)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(and(eq(claimElements.id, elementId), eq(claimElements.claimId, id)));
    }
    return { ok: true };
  }

  @Patch("claim-elements/:id")
  async updateElement(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ElementDto,
  ) {
    const element = await this.loadElement(user.id, id);
    const [updated] = await this.context.db
      .update(claimElements)
      .set({
        text: body.text.trim(),
        elementType: body.type ?? element.elementType,
        updatedAt: new Date(),
      })
      .where(eq(claimElements.id, id))
      .returning();
    return updated;
  }

  @Delete("claim-elements/:id")
  async deleteElement(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.loadElement(user.id, id);
    await this.context.db.delete(claimElements).where(eq(claimElements.id, id));
    return { ok: true };
  }

  @Post("claim-elements/merge")
  async merge(@CurrentUser() user: AuthUser, @Body() body: MergeDto) {
    if (body.ids.length < 2) throw new BadRequestException("Choose at least two elements to merge");
    const elements = await this.context.db.select().from(claimElements).where(inArray(claimElements.id, body.ids));
    if (elements.length !== body.ids.length) throw new BadRequestException("Element not found");
    const claimIds = new Set(elements.map((element) => element.claimId));
    if (claimIds.size !== 1) throw new BadRequestException("Elements must belong to the same claim");
    const claimId = elements[0].claimId;
    await this.loadClaim(user.id, claimId, "edit");
    const survivor = elements[0];
    const others = elements.slice(1).map((element) => element.id);
    await this.context.db
      .update(claimElementEvidence)
      .set({ claimElementId: survivor.id, updatedAt: new Date() })
      .where(inArray(claimElementEvidence.claimElementId, others));
    await this.context.db.delete(claimElements).where(inArray(claimElements.id, others));
    const [updated] = await this.context.db
      .update(claimElements)
      .set({ text: body.text.trim(), updatedAt: new Date() })
      .where(eq(claimElements.id, survivor.id))
      .returning();
    return updated;
  }

  private async loadClaim(userId: string, id: string, mode: "read" | "edit") {
    const [claim] = await this.context.db.select().from(claims).where(eq(claims.id, id)).limit(1);
    if (!claim) throw new BadRequestException("Claim not found");
    await this.access.project(userId, claim.projectId, mode);
    return claim;
  }

  private async loadElement(userId: string, id: string) {
    const [element] = await this.context.db.select().from(claimElements).where(eq(claimElements.id, id)).limit(1);
    if (!element) throw new BadRequestException("Element not found");
    await this.loadClaim(userId, element.claimId, "edit");
    return element;
  }
}
