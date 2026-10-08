import { Module } from "@nestjs/common";
import { EvidenceController } from "./evidence.controller";

@Module({ controllers: [EvidenceController] })
export class EvidenceModule {}
