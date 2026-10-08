import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { auditLogs, organizationMembers, organizations, sessions, users } from "@patent/db";
import { slugify } from "@patent/shared";
import { ContextService } from "../context/context.service";
import type { LoginDto, RegisterDto } from "./dto";

@Injectable()
export class AuthService {
  constructor(private readonly context: ContextService) {}

  async register(input: RegisterDto) {
    const email = input.email.toLowerCase();
    const existing = await this.context.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) throw new ConflictException("An account with that email already exists");
    const passwordHash = await bcrypt.hash(input.password, 12);
    const created = await this.context.db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email, name: input.name.trim(), passwordHash }).returning();
      let slug = slugify(input.organizationName);
      const taken = await tx.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
      if (taken.length > 0) slug = `${slug}-${user.id.slice(0, 8)}`;
      const [organization] = await tx
        .insert(organizations)
        .values({ name: input.organizationName.trim(), slug })
        .returning();
      await tx.insert(organizationMembers).values({
        organizationId: organization.id,
        userId: user.id,
        role: "owner",
      });
      await tx.insert(auditLogs).values({
        organizationId: organization.id,
        userId: user.id,
        action: "auth.register",
        entityType: "user",
        entityId: user.id,
      });
      return { user, organization };
    });
    const token = await this.startSession(created.user.id);
    return { token, profile: await this.profile(created.user.id) };
  }

  async login(input: LoginDto) {
    const email = input.email.toLowerCase();
    const [user] = await this.context.db.select().from(users).where(eq(users.email, email)).limit(1);
    const matches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !matches) throw new UnauthorizedException("Invalid email or password");
    const token = await this.startSession(user.id);
    const profile = await this.profile(user.id);
    if (profile.organization) {
      await this.context.db.insert(auditLogs).values({
        organizationId: profile.organization.id,
        userId: user.id,
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
      });
    }
    return { token, profile };
  }

  async logout(token: string | undefined) {
    if (!token) return;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await this.context.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  async profile(userId: string) {
    const [user] = await this.context.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const [membership] = await this.context.db
      .select({
        role: organizationMembers.role,
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId))
      .limit(1);
    return {
      user,
      organization: membership
        ? { id: membership.id, name: membership.name, slug: membership.slug, role: membership.role }
        : null,
    };
  }

  private async startSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await this.context.db.insert(sessions).values({ userId, tokenHash, expiresAt });
    return token;
  }

  cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 14 * 24 * 60 * 60 * 1000,
    };
  }
}
