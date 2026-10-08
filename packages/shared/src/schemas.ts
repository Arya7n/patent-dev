import { z } from "zod";
import {
  claimElementTypes,
  evidenceRelationships,
  type ClaimElementType,
  type EvidenceRelationship,
} from "./domain";

export const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BBox = z.infer<typeof bboxSchema>;

export const claimElementSchema = z.object({
  id: z.string().regex(/^E\d+$/),
  text: z.string().min(1),
  type: z.enum(claimElementTypes),
});

export const claimDecompositionSchema = z.object({
  claimNumber: z.number().int().positive(),
  elements: z.array(claimElementSchema).min(1),
});
export type ClaimDecomposition = z.infer<typeof claimDecompositionSchema>;

const looseDecompositionSchema = z.object({
  claimNumber: z.coerce.number().int().positive(),
  elements: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string().min(1),
        type: z.string().optional(),
      }),
    )
    .min(1),
});

const elementTypeSet = new Set<string>(claimElementTypes);

export function normalizeClaimDecomposition(
  input: unknown,
): z.SafeParseReturnType<unknown, ClaimDecomposition> {
  const loose = looseDecompositionSchema.safeParse(input);
  if (!loose.success) return loose;
  const elements = loose.data.elements.map((element, index) => ({
    id: element.id && /^E\d+$/.test(element.id) ? element.id : `E${index + 1}`,
    text: element.text.trim(),
    type: (elementTypeSet.has(element.type ?? "")
      ? element.type
      : "other") as ClaimElementType,
  }));
  return claimDecompositionSchema.safeParse({
    claimNumber: loose.data.claimNumber,
    elements,
  });
}

const relationshipAliases: Record<string, EvidenceRelationship> = {
  strong_match: "strong_match",
  strong: "strong_match",
  STRONG_MATCH: "strong_match",
  partial_match: "partial_match",
  partial: "partial_match",
  PARTIAL_MATCH: "partial_match",
  weak_match: "weak_match",
  weak: "weak_match",
  WEAK_MATCH: "weak_match",
  no_evidence: "no_evidence",
  none: "no_evidence",
  NO_EVIDENCE: "no_evidence",
  needs_review: "needs_review",
  NEEDS_REVIEW: "needs_review",
};

export const evidenceAssessmentSchema = z.object({
  relationship: z.enum(evidenceRelationships),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  evidenceText: z.string(),
  sourcePage: z.number().int().positive(),
});
export type EvidenceAssessment = z.infer<typeof evidenceAssessmentSchema>;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeEvidenceAssessment(
  input: unknown,
  fallbackPage: number,
): z.SafeParseReturnType<unknown, EvidenceAssessment> {
  const loose = z
    .object({
      relationship: z.string().optional(),
      confidence: z.coerce.number().optional(),
      reasoning: z.string().optional(),
      evidenceText: z.string().optional(),
      sourcePage: z.coerce.number().optional(),
    })
    .safeParse(input);
  if (!loose.success) return loose;

  const relationship =
    relationshipAliases[loose.data.relationship ?? ""] ?? "needs_review";
  const page = loose.data.sourcePage;
  return evidenceAssessmentSchema.safeParse({
    relationship,
    confidence: clamp01(loose.data.confidence ?? 0),
    reasoning:
      loose.data.reasoning?.trim() ||
      "The model did not provide an explanation. Analyst review required.",
    evidenceText: loose.data.evidenceText?.trim() ?? "",
    sourcePage: page && page > 0 ? Math.round(page) : fallbackPage,
  });
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1].trim());
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Model output did not contain a JSON object");
  }
}

export const pdfExtractionSchema = z.object({
  pageCount: z.number().int().nonnegative(),
  metadata: z
    .object({
      title: z.string().optional(),
      author: z.string().optional(),
    })
    .optional(),
  pages: z.array(
    z.object({
      pageNumber: z.number().int().positive(),
      width: z.number(),
      height: z.number(),
      text: z.string(),
      items: z.array(
        z.object({
          text: z.string(),
          bbox: bboxSchema.nullable().optional(),
        }),
      ),
    }),
  ),
});
export type PdfExtraction = z.infer<typeof pdfExtractionSchema>;
