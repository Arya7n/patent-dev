import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { desc, eq } from "drizzle-orm";
import { projects } from "@patent/db";
import { AccessService } from "../access/access.service";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/session.guard";
import { ContextService } from "../context/context.service";

class CreateProjectDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

@ApiTags("projects")
@ApiCookieAuth()
@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly context: ContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const membership = await this.access.organizationId(user.id);
    return this.context.db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, membership.organizationId))
      .orderBy(desc(projects.updatedAt));
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateProjectDto) {
    const membership = await this.access.organizationId(user.id);
    const [project] = await this.context.db
      .insert(projects)
      .values({
        organizationId: membership.organizationId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        createdBy: user.id,
      })
      .returning();
    await this.access.audit({
      organizationId: membership.organizationId,
      userId: user.id,
      action: "project.create",
      entityType: "project",
      entityId: project.id,
    });
    return project;
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    const { project } = await this.access.project(user.id, id, "read");
    return project;
  }
}
