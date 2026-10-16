import { describe, expect, it } from "vitest";
import {
  chartRowLabel,
  decompositionLooksFragmented,
  ensureAnalystCommentary,
  filterPhraseAlignments,
  preferPassageQuote,
} from "./quality";

describe("chart quality helpers", () => {
  it("labels the preamble and later clauses like a professional chart", () => {
    const preamble = "A communication apparatus for a wireless communications system, comprising:";
    expect(chartRowLabel(1, 0, preamble, preamble)).toBe("Claim 1");
    expect(chartRowLabel(1, 1, "receiving system information from a network", preamble)).toBe("Clause 1");
    expect(chartRowLabel(1, 2, "camping on a suitable cell", preamble)).toBe("Clause 2");
  });

  it("rejects fragmented claim splits that are not exact excerpts", () => {
    const claim = "A bicycle comprising a frame and a wheel that receives sensor data.";
    expect(
      decompositionLooksFragmented(claim, [
        { text: "A bicycle comprising" },
        { text: "a frame" },
        { text: "and a wheel that receives sensor data" },
      ]),
    ).toBe(true);
    expect(
      decompositionLooksFragmented(claim, [
        { text: "A bicycle comprising a frame and a wheel that receives sensor data" },
      ]),
    ).toBe(false);
    expect(
      decompositionLooksFragmented(claim, [
        { text: "A bicycle comprising a frame and a wheel that receives sensor data." },
        { text: "not in the claim at all" },
      ]),
    ).toBe(true);
  });

  it("keeps only phrase alignments that appear in both texts", () => {
    const kept = filterPhraseAlignments(
      "receiving system information from a network",
      "The UE shall receive system information from the network.",
      [
        { claimPhrase: "system information", sourcePhrase: "system information", color: "FFFFCC" },
        { claimPhrase: "MTC indicator", sourcePhrase: "RedCap", color: "C5E0B3" },
      ],
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].claimPhrase).toBe("system information");
  });

  it("prefers a quote that actually appears in the passage", () => {
    const passage = "The UE shall receive system information from the network of the wireless communication system.";
    expect(preferPassageQuote("receive system information", passage)).toBe("receive system information");
    expect(preferPassageQuote("invented quote about RedCap", passage)).toBe(passage.slice(0, 1200));
  });

  it("ensures an analyst ending line", () => {
    expect(ensureAnalystCommentary("The passage describes the same feature.", "Clause 1")).toMatch(
      /Analyst review is required for clause 1/i,
    );
    expect(
      ensureAnalystCommentary("Match found. Hence, the cited reference reads over Clause 1.", "Clause 1"),
    ).toMatch(/reads over Clause 1/i);
  });
});
