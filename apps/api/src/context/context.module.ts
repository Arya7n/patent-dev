import { Global, Module } from "@nestjs/common";
import { ContextService } from "./context.service";
import { JobsService } from "../jobs/jobs.service";
import { AccessService } from "../access/access.service";

@Global()
@Module({
  providers: [ContextService, JobsService, AccessService],
  exports: [ContextService, JobsService, AccessService],
})
export class ContextModule {}
