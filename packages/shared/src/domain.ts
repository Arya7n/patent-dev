export const RESEARCH_DISCLAIMER =
  "Potentially relevant evidence identified for research. This is not a determination of invalidity, infringement, or patentability. Analyst review is required.";

export const memberRoles = ["owner", "admin", "analyst", "viewer"] as const;
export type MemberRole = (typeof memberRoles)[number];

export const documentRoles = ["target", "prior_art", "reference"] as const;
export type DocumentRole = (typeof documentRoles)[number];

export const processingStatuses = [
  "uploaded",
  "queued",
  "processing",
  "ocr_required",
  "extracting",
  "embedding",
  "completed",
  "failed",
] as const;
export type ProcessingStatus = (typeof processingStatuses)[number];

export const claimElementTypes = [
  "component",
  "function",
  "relationship",
  "limitation",
  "other",
] as const;
export type ClaimElementType = (typeof claimElementTypes)[number];

export const evidenceRelationships = [
  "strong_match",
  "partial_match",
  "weak_match",
  "no_evidence",
  "needs_review",
] as const;
export type EvidenceRelationship = (typeof evidenceRelationships)[number];

export const sectionKinds = [
  "title",
  "abstract",
  "description",
  "claims",
  "references",
  "other",
] as const;
export type SectionKind = (typeof sectionKinds)[number];

export const jobTypes = [
  "process_document",
  "extract_claims",
  "decompose_claim",
  "map_element",
  "generate_report",
] as const;
export type JobType = (typeof jobTypes)[number];

export const JOB_QUEUE = "patent-jobs";

export const RELATIONSHIP_LABELS: Record<EvidenceRelationship, string> = {
  strong_match: "Potentially relevant — strong correspondence",
  partial_match: "Possible partial match",
  weak_match: "Weak / possible match",
  no_evidence: "No evidence identified",
  needs_review: "Analyst review required",
};

export const RELATIONSHIP_RANK: Record<EvidenceRelationship, number> = {
  strong_match: 4,
  partial_match: 3,
  weak_match: 2,
  needs_review: 1,
  no_evidence: 0,
};

export function canEditResearch(role: MemberRole): boolean {
  return role === "owner" || role === "admin" || role === "analyst";
}

export function canManageOrg(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "org";
}

export function displayRelationship(link: {
  ai: EvidenceRelationship;
  analyst: EvidenceRelationship | null;
}): EvidenceRelationship {
  return link.analyst ?? link.ai;
}

export function bestRelationship(
  values: EvidenceRelationship[],
): EvidenceRelationship | null {
  if (values.length === 0) return null;
  return values.reduce((best, next) =>
    RELATIONSHIP_RANK[next] > RELATIONSHIP_RANK[best] ? next : best,
  );
}

export type ExistingEvidenceLink = {
  id: string;
  chunkId: string | null;
  analystRelationship: EvidenceRelationship | null;
  analystNote: string | null;
};

export type IncomingEvidenceHit = {
  chunkId: string;
  relationship: EvidenceRelationship;
  confidence: number;
  reasoning: string;
  evidenceText: string;
  sourcePage: number;
};

export function planEvidenceUpdate(
  existing: ExistingEvidenceLink[],
  incoming: IncomingEvidenceHit[],
): {
  update: { id: string; hit: IncomingEvidenceHit }[];
  preserve: string[];
  remove: string[];
  create: IncomingEvidenceHit[];
} {
  const remaining = new Map(incoming.map((hit) => [hit.chunkId, hit]));
  const update: { id: string; hit: IncomingEvidenceHit }[] = [];
  const preserve: string[] = [];
  const remove: string[] = [];

  for (const row of existing) {
    const hit = row.chunkId ? remaining.get(row.chunkId) : undefined;
    if (hit && row.chunkId) {
      update.push({ id: row.id, hit });
      remaining.delete(row.chunkId);
      continue;
    }
    if (row.analystRelationship || row.analystNote) {
      preserve.push(row.id);
      continue;
    }
    remove.push(row.id);
  }

  return { update, preserve, remove, create: [...remaining.values()] };
}

export function decideInvalidModelOutput(attempt: number): "retry" | "needs_review" {
  return attempt < 2 ? "retry" : "needs_review";
}
