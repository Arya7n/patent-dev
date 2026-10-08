import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Request } from "express";
import { sessions, users } from "@patent/db";
import { IS_PUBLIC } from "./public.decorator";
import { ContextService } from "../context/context.service";

export type AuthUser = { id: string; email: string; name: string };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: ContextService,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      execution.getHandler(),
      execution.getClass(),
    ]);
    const request = execution.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = await this.userFromRequest(request);
    if (user) request.user = user;
    if (isPublic) return true;
    if (!user) throw new UnauthorizedException("Sign in required");
    return true;
  }

  async userFromRequest(request: Request): Promise<AuthUser | null> {
    const token = request.cookies?.[this.context.env.AUTH_COOKIE_NAME];
    if (!token || typeof token !== "string") return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [row] = await this.context.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);
    return row ?? null;
  }
}
