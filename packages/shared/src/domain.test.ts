import { describe, expect, it } from "vitest";
import {
  bestRelationship,
  canEditResearch,
  canManageOrg,
  decideInvalidModelOutput,
  displayRelationship,
  planEvidenceUpdate,
  slugify,
} from "./domain";

describe("permissions", () => {
  it("lets analysts edit research and keeps viewers read-only", () => {
    expect(canEditResearch("analyst")).toBe(true);
    expect(canEditResearch("owner")).toBe(true);
    expect(canEditResearch("viewer")).toBe(false);
    expect(canManageOrg("admin")).toBe(true);
    expect(canManageOrg("analyst")).toBe(false);
  });
});

describe("relationships", () => {
  it("prefers an analyst override and otherwise the strongest correspondence", () => {
    expect(displayRelationship({ ai: "weak_match", analyst: "strong_match" })).toBe("strong_match");
    expect(displayRelationship({ ai: "partial_match", analyst: null })).toBe("partial_match");
    expect(bestRelationship(["no_evidence", "weak_match", "partial_match"])).toBe("partial_match");
    expect(bestRelationship([])).toBeNull();
  });
});

describe("planEvidenceUpdate", () => {
  it("keeps analyst notes when a chunk drops out and refreshes chunks that remain", () => {
    const plan = planEvidenceUpdate(
      [
        { id: "a", chunkId: "c1", analystRelationship: "strong_match", analystNote: "confirmed" },
        { id: "b", chunkId: "c2", analystRelationship: null, analystNote: null },
        { id: "c", chunkId: "c3", analystRelationship: null, analystNote: "check figure 2" },
      ],
      [
        {
          chunkId: "c1",
          relationship: "partial_match",
          confidence: 0.4,
          reasoning: "updated",
          evidenceText: "sensor",
          sourcePage: 2,
        },
        {
          chunkId: "c4",
          relationship: "weak_match",
          confidence: 0.2,
          reasoning: "new",
          evidenceText: "alert",
          sourcePage: 3,
        },
      ],
    );
    expect(plan.update.map((row) => row.id)).toEqual(["a"]);
    expect(plan.remove).toEqual(["b"]);
    expect(plan.preserve).toEqual(["c"]);
    expect(plan.create.map((row) => row.chunkId)).toEqual(["c4"]);
  });
});

describe("model failures", () => {
  it("retries once and then requires analyst review", () => {
    expect(decideInvalidModelOutput(1)).toBe("retry");
    expect(decideInvalidModelOutput(2)).toBe("needs_review");
  });
});

describe("slugify", () => {
  it("builds a url-safe organization slug", () => {
    expect(slugify("Acme Patent Lab")).toBe("acme-patent-lab");
    expect(slugify("!!!")).toBe("org");
  });
});
