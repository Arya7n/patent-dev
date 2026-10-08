export type Profile = {
  user: { id: string; email: string; name: string } | undefined;
  organization: { id: string; name: string; slug: string; role: string } | null;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

export type PatentDocument = {
  id: string;
  role: "target" | "prior_art" | "reference";
  title: string | null;
  originalFilename: string;
  status: string;
  error: string | null;
  pageCount: number | null;
};

export type ClaimElement = {
  id: string;
  elementKey: string;
  text: string;
  elementType: string;
  sortOrder: number;
};

export type Claim = {
  id: string;
  claimNumber: number;
  text: string;
  isIndependent: boolean;
  elements: ClaimElement[];
};

export type EvidenceItem = {
  id: string;
  displayRelationship: string;
  displayLabel: string;
  analystRelationship: string | null;
  analystNote: string | null;
  confidence: number | null;
  documentId: string | null;
  documentTitle: string | null;
  evidence: {
    id: string;
    text: string;
    pageNumber: number;
    explanation: string;
    bbox: { x: number; y: number; width: number; height: number } | null;
    documentId: string;
  } | null;
};

export type ClaimChart = {
  projectName: string;
  disclaimer: string;
  elements: { id: string; key: string; text: string; claimNumber: number }[];
  priorArt: { id: string; title: string }[];
  cells: {
    elementId: string;
    documentId: string;
    relationship: string;
    label: string;
    confidence: number | null;
    evidence: {
      text: string;
      pageNumber: number;
      explanation: string;
      confidence: number;
      analystNote: string | null;
      evidenceId: string | null;
    }[];
  }[];
};

export type Report = {
  id: string;
  title: string;
  status: string;
  error: string | null;
};

export type Job = {
  id: string;
  status: string;
  error: string | null;
  type: string;
};

export const STATUS_CLASS: Record<string, string> = {
  strong_match: "bg-emerald-100 text-emerald-950",
  partial_match: "bg-amber-100 text-amber-950",
  weak_match: "bg-stone-200 text-stone-800",
  no_evidence: "bg-stone-100 text-stone-500",
  needs_review: "bg-rose-100 text-rose-950",
};
