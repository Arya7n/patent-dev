import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStorage, resolveInside, signDownload, verifyDownload } from "./index";

describe("local storage", () => {
  it("rejects path traversal and round-trips a file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "patent-storage-"));
    expect(() => resolveInside(root, "../outside.txt")).toThrow(/Invalid storage key/);
    const storage = createStorage({ provider: "local", localPath: root });
    await storage.put("org/project/file.pdf", Buffer.from("pdf"), "application/pdf");
    const saved = await readFile(path.join(root, "org", "project", "file.pdf"));
    expect(saved.toString()).toBe("pdf");
    expect((await storage.get("org/project/file.pdf")).toString()).toBe("pdf");
  });
});

describe("signed downloads", () => {
  it("accepts a current signature and rejects a tampered one", () => {
    const expiresAt = 2_000;
    const signature = signDownload("secret", "org/file.pdf", expiresAt);
    expect(verifyDownload("secret", "org/file.pdf", expiresAt, signature, 1_000)).toBe(true);
    expect(verifyDownload("secret", "org/file.pdf", expiresAt, signature, 3_000)).toBe(false);
    expect(verifyDownload("secret", "org/other.pdf", expiresAt, signature, 1_000)).toBe(false);
  });
});
