import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentUser } from "./current-user.decorator";
import { LoginDto, RegisterDto } from "./dto";
import { Public } from "./public.decorator";
import { AuthService } from "./auth.service";
import type { AuthUser } from "./session.guard";
import { ContextService } from "../context/context.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly context: ContextService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("register")
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(body);
    this.setCookie(response, result.token);
    return result.profile;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body);
    this.setCookie(response, result.token);
    return result.profile;
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.[this.context.env.AUTH_COOKIE_NAME];
    await this.auth.logout(typeof token === "string" ? token : undefined);
    response.clearCookie(this.context.env.AUTH_COOKIE_NAME, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.id);
  }

  private setCookie(response: Response, token: string) {
    response.cookie(this.context.env.AUTH_COOKIE_NAME, token, this.auth.cookieOptions());
  }
}
