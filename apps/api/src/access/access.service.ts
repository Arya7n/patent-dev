import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { auditLogs, organizationMembers, projects } from "@patent/db";
import { canEditResearch, memberRoles, type MemberRole } from "@patent/shared";
import { ContextService } from "../context/context.service";

@Injectable()
export class AccessService {
  constructor(private readonly context: ContextService) {}

  async project(userId: string, projectId: string, mode: "read" | "edit") {
    const [row] = await this.context.db
      .select({ project: projects, role: organizationMembers.role })
      .from(projects)
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, projects.organizationId),
          eq(organizationMembers.userId, userId),
        ),
      )
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!row) throw new NotFoundException("Project not found");
    const role = asRole(row.role);
    if (mode === "edit" && !canEditResearch(role)) {
      throw new ForbiddenException("You do not have permission to edit this project");
    }
    return { project: row.project, role };
  }

  async organizationId(userId: string) {
    const [row] = await this.context.db
      .select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId))
      .limit(1);
    if (!row) throw new NotFoundException("Organization not found");
    return row;
  }

  async audit(input: {
    organizationId: string;
    userId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    await this.context.db.insert(auditLogs).values({
      organizationId: input.organizationId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
    });
  }
}

function asRole(value: string): MemberRole {
  if ((memberRoles as readonly string[]).includes(value)) return value as MemberRole;
  return "viewer";
}
