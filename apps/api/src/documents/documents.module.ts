import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DocumentsController } from "./documents.controller";
import { SessionGuard } from "../auth/session.guard";

@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
  providers: [SessionGuard],
})
export class DocumentsModule {}
