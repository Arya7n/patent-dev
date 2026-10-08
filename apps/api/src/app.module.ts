import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { SessionGuard } from "./auth/session.guard";
import { ClaimsModule } from "./claims/claims.module";
import { ContextModule } from "./context/context.module";
import { DocumentsModule } from "./documents/documents.module";
import { EvidenceModule } from "./evidence/evidence.module";
import { ProjectsModule } from "./projects/projects.module";
import { ReportsModule } from "./reports/reports.module";
import { SystemModule } from "./system/system.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ContextModule,
    AuthModule,
    ProjectsModule,
    DocumentsModule,
    ClaimsModule,
    EvidenceModule,
    ReportsModule,
    SystemModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
