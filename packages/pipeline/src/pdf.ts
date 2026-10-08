import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pdfExtractionSchema, type BBox, type PdfExtraction } from "@patent/shared";

export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export async function extractPdf(
  buffer: Buffer,
  options: { pythonBin: string; repoRoot: string },
): Promise<{ extraction: PdfExtraction; ocrApplied: boolean }> {
  const directory = await mkdtemp(path.join(tmpdir(), "patent-pdf-"));
  const source = path.join(directory, "input.pdf");
  try {
    await writeFile(source, buffer);
    let ocrApplied = false;
    let current = source;
    let extraction = await extractOnce(current, options);
    if (needsMoreText(extraction)) {
      const ocrPath = path.join(directory, "ocr.pdf");
      ocrApplied = await runOcr(options.pythonBin, current, ocrPath);
      if (ocrApplied) {
        current = ocrPath;
        extraction = await extractOnce(current, options);
      }
    }
    return { extraction, ocrApplied };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function needsMoreText(extraction: PdfExtraction): boolean {
  if (extraction.pages.length === 0) return true;
  const total = extraction.pages.reduce((sum, page) => sum + page.text.trim().length, 0);
  return total / extraction.pages.length < 40;
}

async function extractOnce(
  filePath: string,
  options: { pythonBin: string; repoRoot: string },
): Promise<PdfExtraction> {
  const script = path.join(options.repoRoot, "services", "pdf-worker", "extract_pdf.py");
  if (existsSync(script)) {
    const output = path.join(path.dirname(filePath), "extract.json");
    const code = await run(options.pythonBin, [script, filePath, output]);
    if (code === 0 && existsSync(output)) {
      const parsed = pdfExtractionSchema.safeParse(JSON.parse(await readFile(output, "utf8")));
      if (parsed.success) return parsed.data;
    }
  }
  return extractWithPdfJs(await readFile(filePath));
}

async function runOcr(pythonBin: string, input: string, output: string): Promise<boolean> {
  const code = await run(pythonBin, ["-m", "ocrmypdf", "--skip-text", input, output]);
  return code === 0 && existsSync(output);
}

function run(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type PdfJsModule = {
  getDocument: (src: { data: Uint8Array; disableFontFace?: boolean }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getViewport: (input: { scale: number }) => { width: number; height: number };
        getTextContent: () => Promise<{ items: PdfTextItem[] }>;
      }>;
    }>;
  };
};

async function extractWithPdfJs(buffer: Buffer): Promise<PdfExtraction> {
  const loader = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<PdfJsModule>;
  const pdfjs = await loader("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs
    .getDocument({ data: new Uint8Array(buffer), disableFontFace: true })
    .promise;
  const pages: PdfExtraction["pages"] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: { text: string; bbox: BBox | null }[] = [];
    for (const item of content.items) {
      if (!item.str?.trim() || !item.transform) continue;
      const x = item.transform[4] ?? 0;
      const y = item.transform[5] ?? 0;
      const height = item.height ?? 0;
      items.push({
        text: item.str,
        bbox: {
          x,
          y: viewport.height - y - height,
          width: item.width ?? 0,
          height,
        },
      });
    }
    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      text: items.map((item) => item.text).join("\n"),
      items,
    });
  }
  return { pageCount: document.numPages, pages };
}
