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

export function isDocumentBusy(status: string) {
  return status === "queued" || status === "extracting" || status === "embedding" || status === "processing";
}

export function formatWhen(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}
