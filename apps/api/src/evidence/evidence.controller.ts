import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { eq } from "drizzle-orm";
import { annotations, claimElementEvidence, claimElements, claims, documents, evidence } from "@patent/db";
import {
  displayRelationship,
  evidenceRelationships,
  RELATIONSHIP_LABELS,
  type EvidenceRelationship,
} from "@patent/shared";
import { loadClaimChart } from "@patent/pipeline";
import { AccessService } from "../access/access.service";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/session.guard";
import { ContextService } from "../context/context.service";
import { JobsService } from "../jobs/jobs.service";

class NoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiProperty()
  @IsString()
  targetType!: string;

  @ApiProperty()
  @IsString()
  targetId!: string;
}

class OverrideDto {
  @ApiPropertyOptional({ enum: evidenceRelationships })
  @IsOptional()
  @IsIn([...evidenceRelationships])
  analystRelationship?: EvidenceRelationship;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  analystNote?: string;
}

@ApiTags("evidence")
@ApiCookieAuth()
@Controller()
export class EvidenceController {
  constructor(
    private readonly context: ContextService,
    private readonly access: AccessService,
    private readonly jobs: JobsService,
  ) {}

  @Post("claim-elements/:id/search")
  async search(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    const loaded = await this.loadElement(user.id, id);
    const job = await this.jobs.enqueue({
      organizationId: loaded.organizationId,
      projectId: loaded.projectId,
      claimElementId: id,
      type: "map_element",
    });
    return { jobId: job.id, status: job.status };
  }

  @Get("claim-elements/:id/evidence")
  async list(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.loadElement(user.id, id, "read");
    const rows = await this.context.db
      .select({
        link: claimElementEvidence,
        evidence,
        documentTitle: documents.title,
        filename: documents.originalFilename,
      })
      .from(claimElementEvidence)
      .leftJoin(evidence, eq(evidence.id, claimElementEvidence.evidenceId))
      .leftJoin(documents, eq(documents.id, claimElementEvidence.priorArtDocumentId))
      .where(eq(claimElementEvidence.claimElementId, id));
    return rows.map((row) => this.present(row.link, row.evidence, row.documentTitle || row.filename));
  }

  @Patch("evidence/:id")
  async override(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: OverrideDto,
  ) {
    const [link] = await this.context.db
      .select()
      .from(claimElementEvidence)
      .where(eq(claimElementEvidence.id, id))
      .limit(1);
    if (!link) throw new BadRequestException("Evidence mapping not found");
    const loaded = await this.loadElement(user.id, link.claimElementId);
    const [updated] = await this.context.db
      .update(claimElementEvidence)
      .set({
        analystRelationship: body.analystRelationship ?? link.analystRelationship,
        analystNote: body.analystNote ?? link.analystNote,
        updatedAt: new Date(),
      })
      .where(eq(claimElementEvidence.id, id))
      .returning();
    await this.access.audit({
      organizationId: loaded.organizationId,
      userId: user.id,
      action: "evidence.override",
      entityType: "claim_element_evidence",
      entityId: id,
      metadata: { analystRelationship: updated.analystRelationship },
    });
    return updated;
  }

  @Get("projects/:id/claim-chart")
  async chart(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) projectId: string) {
    await this.access.project(user.id, projectId, "read");
    const chart = await loadClaimChart(this.context.db, projectId);
    return {
      ...chart,
      cells: chart.cells.map((cell) => ({
        ...cell,
        label: RELATIONSHIP_LABELS[cell.relationship],
      })),
    };
  }

  @Get("projects/:id/annotations")
  async notes(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) projectId: string) {
    await this.access.project(user.id, projectId, "read");
    return this.context.db.select().from(annotations).where(eq(annotations.projectId, projectId));
  }

  @Post("projects/:id/annotations")
  async addNote(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) projectId: string,
    @Body() body: NoteDto,
  ) {
    const { project } = await this.access.project(user.id, projectId, "edit");
    const [note] = await this.context.db
      .insert(annotations)
      .values({
        projectId,
        userId: user.id,
        targetType: body.targetType,
        targetId: body.targetId,
        body: body.body.trim(),
      })
      .returning();
    await this.access.audit({
      organizationId: project.organizationId,
      userId: user.id,
      action: "annotation.create",
      entityType: body.targetType,
      entityId: note.id,
    });
    return note;
  }

  private present(
    link: typeof claimElementEvidence.$inferSelect,
    item: typeof evidence.$inferSelect | null,
    documentTitle: string | null,
  ) {
    const ai = asRelationship(link.aiRelationship);
    const analyst = link.analystRelationship ? asRelationship(link.analystRelationship) : null;
    const shown = displayRelationship({ ai, analyst });
    return {
      id: link.id,
      aiRelationship: ai,
      aiLabel: RELATIONSHIP_LABELS[ai],
      analystRelationship: analyst,
      analystLabel: analyst ? RELATIONSHIP_LABELS[analyst] : null,
      displayRelationship: shown,
      displayLabel: RELATIONSHIP_LABELS[shown],
      analystNote: link.analystNote,
      confidence: link.aiConfidence,
      documentId: link.priorArtDocumentId,
      documentTitle,
      evidence: item
        ? {
            id: item.id,
            text: item.evidenceText,
            pageNumber: item.pageNumber,
            explanation: item.explanation,
            bbox: item.bbox,
            documentId: item.sourceDocumentId,
          }
        : null,
    };
  }

  private async loadElement(userId: string, elementId: string, mode: "read" | "edit" = "edit") {
    const [element] = await this.context.db.select().from(claimElements).where(eq(claimElements.id, elementId)).limit(1);
    if (!element) throw new BadRequestException("Claim element not found");
    const [claim] = await this.context.db.select().from(claims).where(eq(claims.id, element.claimId)).limit(1);
    if (!claim) throw new BadRequestException("Claim not found");
    const { project } = await this.access.project(userId, claim.projectId, mode);
    return { element, claim, projectId: claim.projectId, organizationId: project.organizationId };
  }
}

function asRelationship(value: string): EvidenceRelationship {
  if ((evidenceRelationships as readonly string[]).includes(value)) return value as EvidenceRelationship;
  return "needs_review";
}
