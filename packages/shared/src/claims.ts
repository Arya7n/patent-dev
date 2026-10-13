export type ClaimDraft = {
  claimNumber: number;
  text: string;
  isIndependent: boolean;
};

export function extractClaimBlocks(text: string): ClaimDraft[] {
  const matches = [...text.matchAll(/(?:^|\n)\s*(\d{1,3})\.\s+/g)];
  const claims: ClaimDraft[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const claimNumber = Number(match[1]);
    if (!match.index && match.index !== 0) continue;
    if (claimNumber < 1 || claimNumber > 500) continue;
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;
    const body = text.slice(start, end).replace(/\s+/g, " ").trim();
    if (!body) continue;
    claims.push({
      claimNumber,
      text: body,
      isIndependent: !/\bclaims?\s+\d+\b/i.test(body),
    });
  }
  return claims;
}

const CLAIM_PREAMBLE = /(?:^|\n)\s*(?:what is claimed is|i claim|we claim|claims?)\b[^\n]*(?:\n|$)/gi;

export function textAfterClaimPreamble(text: string): string | null {
  let last: RegExpMatchArray | null = null;
  for (const match of text.matchAll(CLAIM_PREAMBLE)) last = match;
  if (!last || last.index == null) return null;
  return text.slice(last.index + last[0].length);
}

export function extractClaimsFromSections(
  sections: { kind: string; text: string }[],
): ClaimDraft[] {
  const claimsSections = sections.filter((section) => section.kind === "claims");
  if (claimsSections.length > 0) {
    return extractClaimBlocks(claimsSections.map((section) => section.text).join("\n"));
  }
  const full = sections.map((section) => section.text).join("\n");
  const claimsText = textAfterClaimPreamble(full);
  return extractClaimBlocks(claimsText ?? full);
}
