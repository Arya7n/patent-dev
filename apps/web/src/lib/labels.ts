const DOCUMENT_STATUS: Record<string, string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  extracting: "Reading PDF",
  embedding: "Indexing",
  ocr_required: "Needs OCR",
  completed: "Ready",
  failed: "Failed",
  processing: "Working",
};

const ROLE: Record<string, string> = {
  target: "Target patent",
  prior_art: "Prior art",
  reference: "Reference",
};

export function documentStatusLabel(status: string) {
  return DOCUMENT_STATUS[status] ?? status;
}

export function documentRoleLabel(role: string) {
  return ROLE[role] ?? role;
}

export function isSearchableReference(document: { role: string; status: string }) {
  return (document.role === "prior_art" || document.role === "reference") && document.status === "completed";
}

export function isDocumentBusy(status: string) {
  return status === "queued" || status === "extracting" || status === "embedding" || status === "processing";
}

function isPreamble(text: string): boolean {
  const trimmed = text.trim();
  if (/^(receiving|camping|determining|transmitting|performing|sending|selecting|monitoring|applying|filling|providing|controlling)\b/i.test(trimmed)) {
    return false;
  }
  return /comprising|processing means|storage unit|program code|a method|an apparatus|a system|a device/i.test(trimmed);
}

export function clauseLabel(claimNumber: number, index: number, firstElementText: string): string {
  const preamble = isPreamble(firstElementText);
  if (preamble && index === 0) return `Claim ${claimNumber}`;
  return `Clause ${preamble ? index : index + 1}`;
}

export function formatWhen(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
