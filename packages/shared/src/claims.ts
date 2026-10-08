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

export function extractClaimsFromSections(
  sections: { kind: string; text: string }[],
): ClaimDraft[] {
  const claimsSections = sections.filter((section) => section.kind === "claims");
  if (claimsSections.length > 0) {
    return extractClaimBlocks(claimsSections.map((section) => section.text).join("\n"));
  }
  return extractClaimBlocks(sections.map((section) => section.text).join("\n"));
}
