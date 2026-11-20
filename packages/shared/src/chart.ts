import {
  bestRelationship,
  displayRelationship,
  RESEARCH_DISCLAIMER,
  type EvidenceRelationship,
} from "./domain";
import type { PhraseAlignment } from "./schemas";

export type ChartEvidence = {
  text: string;
  pageNumber: number;
  explanation: string;
  confidence: number;
  analystRelationship: EvidenceRelationship | null;
  analystNote: string | null;
  evidenceId: string | null;
  alignments: PhraseAlignment[];
};

export type ChartCell = {
  elementId: string;
  documentId: string;
  relationship: EvidenceRelationship;
  confidence: number | null;
  evidence: ChartEvidence[];
};

export type ClaimChart = {
  projectName: string;
  disclaimer: string;
  targetTitle: string | null;
  elements: { id: string; key: string; text: string; claimNumber: number; claimText: string }[];
  priorArt: { id: string; title: string }[];
  cells: ChartCell[];
};

export type ChartLinkInput = {
  elementId: string;
  documentId: string | null;
  ai: EvidenceRelationship;
  analyst: EvidenceRelationship | null;
  confidence: number | null;
  evidenceId: string | null;
  evidenceText: string | null;
  pageNumber: number | null;
  explanation: string | null;
  analystNote: string | null;
  alignments?: PhraseAlignment[];
};

export function buildClaimChart(input: {
  projectName: string;
  targetTitle?: string | null;
  elements: ClaimChart["elements"];
  priorArt: ClaimChart["priorArt"];
  links: ChartLinkInput[];
}): ClaimChart {
  const grouped = new Map<string, ChartLinkInput[]>();
  for (const link of input.links) {
    if (!link.documentId) continue;
    const key = `${link.elementId}:${link.documentId}`;
    const list = grouped.get(key) ?? [];
    list.push(link);
    grouped.set(key, list);
  }

  const cells: ChartCell[] = [];
  for (const [key, links] of grouped) {
    const [elementId, documentId] = key.split(":");
    const relationship = bestRelationship(
      links.map((link) => displayRelationship({ ai: link.ai, analyst: link.analyst })),
    );
    if (!relationship || !elementId || !documentId) continue;
    const confidences = links
      .map((link) => link.confidence)
      .filter((value): value is number => value !== null);
    cells.push({
      elementId,
      documentId,
      relationship,
      confidence: confidences.length
        ? Math.max(...confidences)
        : null,
      evidence: links
        .filter((link) => link.evidenceText)
        .map((link) => ({
          text: link.evidenceText ?? "",
          pageNumber: link.pageNumber ?? 1,
          explanation: link.explanation ?? "",
          confidence: link.confidence ?? 0,
          analystRelationship: link.analyst,
          analystNote: link.analystNote,
          evidenceId: link.evidenceId,
          alignments: link.alignments ?? [],
        })),
    });
  }

  return {
    projectName: input.projectName,
    disclaimer: RESEARCH_DISCLAIMER,
    targetTitle: input.targetTitle ?? null,
    elements: input.elements,
    priorArt: input.priorArt,
    cells,
  };
}

const PUBLICATION_NUMBER = /(?:^|[^A-Z0-9])(US|EP|WO|CN|JP|KR)\s?-?\s?(\d{4,12})([A-Z]\d?)?(?!\d)/i;

export function patentLabel(filename: string | null | undefined, title: string | null | undefined): string | null {
  const fromFile = publicationNumber(filename ?? "");
  if (fromFile) return fromFile;
  const fromTitle = publicationNumber(title ?? "");
  if (fromTitle) return fromTitle;
  const cleaned = title?.replace(/\s+/g, " ").trim();
  if (cleaned && !/^\d[\d-]{8,}$/.test(cleaned)) return cleaned;
  const fallback = filename?.replace(/\.pdf$/i, "").trim();
  return fallback || cleaned || null;
}

function publicationNumber(value: string): string | null {
  const match = value.match(PUBLICATION_NUMBER);
  if (!match) return null;
  return `${match[1]}${match[2]}${match[3] ?? ""}`.replace(/[\s-]+/g, "").toUpperCase();
}

