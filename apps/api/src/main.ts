import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { parseRuntimeEnv } from "@patent/pipeline";

async function bootstrap() {
  const env = parseRuntimeEnv(process.env);
  const app = await NestFactory.create(AppModule);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cookieParser());
  app.enableCors({
    origin: env.AUTH_CORS_ORIGINS.split(",").map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  const swagger = new DocumentBuilder()
    .setTitle("Patent research API")
    .setDescription("Analyst workspace API. AI output is research assistance, not a legal conclusion.")
    .setVersion("0.1.0")
    .addCookieAuth(env.AUTH_COOKIE_NAME)
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));
  await app.listen(env.API_PORT);
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "API failed to start";
  console.error(message);
  process.exit(1);
});
