import type { PhraseAlignment } from "./schemas";

export function normalizeClaimWhitespace(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isPreambleElement(text: string, index: number): boolean {
  if (index !== 0) return false;
  const trimmed = text.trim();
  if (
    /^(receiving|camping|determining|transmitting|performing|sending|selecting|monitoring|applying|filling|providing|controlling)\b/i.test(
      trimmed,
    )
  ) {
    return false;
  }
  return /comprising|processing means|storage unit|program code|a method|an apparatus|a system|a device/i.test(trimmed);
}

export function chartRowLabel(
  claimNumber: number,
  index: number,
  elementText: string,
  firstElementText: string,
): string {
  const preamble = isPreambleElement(firstElementText, 0);
  if (preamble && index === 0) return `Claim ${claimNumber}`;
  return `Clause ${preamble ? index : index + 1}`;
}

export function elementsAreClaimExcerpts(claimText: string, elements: { text: string }[]): boolean {
  const claim = normalizeClaimWhitespace(claimText);
  if (!claim || elements.length === 0) return false;
  return elements.every((element) => {
    const excerpt = normalizeClaimWhitespace(element.text);
    return excerpt.length > 0 && claim.includes(excerpt);
  });
}

export function decompositionLooksFragmented(claimText: string, elements: { text: string }[]): boolean {
  if (elements.length === 0) return true;
  if (elements.length > 14) return true;
  if (!elementsAreClaimExcerpts(claimText, elements)) return true;
  const bareNoun = elements.filter((element) => /^(and\s+)?an?\s+[\w-]+$/i.test(element.text.trim())).length;
  if (bareNoun > 0 && elements.length >= 3) return true;
  const short = elements.filter((element) => element.text.trim().length < 18).length;
  if (elements.length >= 5 && short >= Math.ceil(elements.length * 0.6)) return true;
  const claim = normalizeClaimWhitespace(claimText);
  const covered = elements.reduce((sum, element) => sum + normalizeClaimWhitespace(element.text).length, 0);
  if (claim.length > 80 && covered < claim.length * 0.55) return true;
  return false;
}

export function filterPhraseAlignments(
  claimText: string,
  evidenceText: string,
  alignments: PhraseAlignment[],
): PhraseAlignment[] {
  const claim = claimText.toLowerCase();
  const evidence = evidenceText.toLowerCase();
  const seen = new Set<string>();
  return alignments.filter((item) => {
    const claimPhrase = item.claimPhrase.trim();
    const sourcePhrase = item.sourcePhrase.trim();
    if (claimPhrase.length < 3 || sourcePhrase.length < 3) return false;
    if (!claim.includes(claimPhrase.toLowerCase())) return false;
    if (!evidence.includes(sourcePhrase.toLowerCase())) return false;
    const key = `${claimPhrase.toLowerCase()}::${sourcePhrase.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ensureAnalystCommentary(commentary: string, rowLabel: string): string {
  const trimmed = commentary.replace(/\s+/g, " ").trim();
  if (!trimmed) return "Analyst review is required.";
  if (/Hence,\s+the\s+(cited\s+reference|standard\s+literature)\s+reads\s+(on|over)\b/i.test(trimmed)) {
    return trimmed;
  }
  if (/Hence,\s+the\s+(cited\s+reference|standard\s+literature)\s+does\s+not\s+read\s+(on|over)\b/i.test(trimmed)) {
    return trimmed;
  }
  if (/Analyst review is required\.?\s*$/i.test(trimmed)) return trimmed;
  const label = /claim\s+\d+/i.test(rowLabel) ? "the preamble" : rowLabel.toLowerCase();
  return `${trimmed} Analyst review is required for ${label}.`;
}

export function preferPassageQuote(modelQuote: string, passage: string): string {
  const quote = modelQuote.trim();
  const source = passage.trim();
  if (!quote) return source.slice(0, 1200);
  if (normalizeClaimWhitespace(source).includes(normalizeClaimWhitespace(quote))) return quote;
  return source.slice(0, 1200);
}
