import {
  AlignmentType,
  Document,
  Header,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import PDFDocument from "pdfkit";
import type { ClaimChart, PhraseAlignment } from "@patent/shared";

const INK = "333333";
const HEADER_BLUE = "0070C0";

type TextPart = { text: string; color: string | null };

function quoteParts(text: string, alignments: PhraseAlignment[], field: "claimPhrase" | "sourcePhrase"): TextPart[] {
  const marks = alignments
    .map((item) => ({ phrase: item[field], color: item.color }))
    .filter((item) => item.phrase.length > 0)
    .sort((a, b) => b.phrase.length - a.phrase.length);
  const parts: TextPart[] = [];
  let cursor = 0;
  const lower = text.toLowerCase();
  while (cursor < text.length) {
    let found: { index: number; phrase: string; color: string } | null = null;
    for (const mark of marks) {
      const index = lower.indexOf(mark.phrase.toLowerCase(), cursor);
      if (index < 0) continue;
      if (!found || index < found.index || (index === found.index && mark.phrase.length > found.phrase.length)) {
        found = { index, phrase: text.slice(index, index + mark.phrase.length), color: mark.color };
      }
    }
    if (!found) {
      parts.push({ text: text.slice(cursor), color: null });
      break;
    }
    if (found.index > cursor) parts.push({ text: text.slice(cursor, found.index), color: null });
    parts.push({ text: found.phrase, color: found.color });
    cursor = found.index + found.phrase.length;
  }
  return parts.filter((part) => part.text.length > 0);
}

function docxRuns(text: string, alignments: PhraseAlignment[], field: "claimPhrase" | "sourcePhrase", bold = false): TextRun[] {
  const parts = quoteParts(text, alignments, field);
  if (parts.length === 0) return [new TextRun({ text, color: INK, bold })];
  return parts.map(
    (part) =>
      new TextRun({
        text: part.text,
        bold,
        color: INK,
        shading: part.color ? { type: ShadingType.CLEAR, fill: part.color } : undefined,
      }),
  );
}

function cell(children: Paragraph[], fill?: string): TableCell {
  return new TableCell({
    width: { size: fill ? 4680 : 4680, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    children,
  });
}

function paragraph(text: string, options?: { bold?: boolean; color?: string; size?: number }): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        color: options?.color ?? INK,
        size: options?.size ?? 20,
      }),
    ],
  });
}

function isPreamble(text: string, index: number): boolean {
  if (index !== 0) return false;
  const trimmed = text.trim();
  if (/^(receiving|camping|determining|transmitting|performing|sending|selecting|monitoring|applying)\b/i.test(trimmed)) return false;
  return /comprising|processing means|storage unit|program code/i.test(trimmed);
}

function bestEvidence(chart: ClaimChart, elementId: string, documentId: string) {
  const cell = chart.cells.find((item) => item.elementId === elementId && item.documentId === documentId);
  const ranked = [...(cell?.evidence ?? [])].sort((a, b) => b.confidence - a.confidence);
  return ranked[0] ?? null;
}

export async function renderDocx(chart: ClaimChart): Promise<Buffer> {
  const claimNumbers = [...new Set(chart.elements.map((element) => element.claimNumber))];
  const rows: TableRow[] = [
    new TableRow({
      children: [
        cell([paragraph("Patent number", { bold: true })]),
        cell([paragraph(chart.targetTitle || chart.projectName, { bold: true, color: HEADER_BLUE, size: 22 })]),
      ],
    }),
    new TableRow({
      children: [
        cell([paragraph("Matter", { bold: true })]),
        cell([paragraph(chart.projectName)]),
      ],
    }),
    new TableRow({
      children: [
        cell([paragraph("Standards / references", { bold: true })]),
        cell(
          chart.priorArt.length > 0
            ? chart.priorArt.map((document, index) => paragraph(`${index + 1}. ${document.title}`))
            : [paragraph("No reference documents were uploaded.")],
        ),
      ],
    }),
    new TableRow({
      children: [
        cell([paragraph("Claims", { bold: true, color: "FFFFFF" })], "1F4B3A"),
        cell([paragraph("Mapping", { bold: true, color: "FFFFFF" })], "1F4B3A"),
      ],
    }),
  ];

  for (const claimNumber of claimNumbers) {
    const elements = chart.elements.filter((element) => element.claimNumber === claimNumber);
    const claimText = elements[0]?.claimText || "";
    const preamble = isPreamble(elements[0]?.text ?? "", 0);
    elements.forEach((element, index) => {
      const label = preamble && index === 0 ? `Claim ${claimNumber}` : `Clause ${preamble ? index : index + 1}`;
      const left = [
        paragraph(label, { bold: true, color: HEADER_BLUE }),
        new Paragraph({
          spacing: { after: 80 },
          children: docxRuns(
            preamble && index === 0 ? element.text || claimText : element.text,
            chart.priorArt.flatMap((document) => bestEvidence(chart, element.id, document.id)?.alignments ?? []),
            "claimPhrase",
          ),
        }),
      ];
      const mappings = chart.priorArt.flatMap((document) => {
        const evidence = bestEvidence(chart, element.id, document.id);
        const blocks = [paragraph(document.title, { bold: true, color: HEADER_BLUE })];
        if (!evidence) {
          blocks.push(paragraph("No corresponding passage was identified."));
          return blocks;
        }
        blocks.push(
          new Paragraph({
            spacing: { after: 80 },
            children: docxRuns(evidence.text || "No quoted passage was stored.", evidence.alignments, "sourcePhrase"),
          }),
        );
        blocks.push(paragraph(`Page ${evidence.pageNumber}`, { size: 18, color: "666666" }));
        blocks.push(paragraph(evidence.explanation));
        if (evidence.analystNote) blocks.push(paragraph(`Analyst note: ${evidence.analystNote}`));
        return blocks;
      });
      rows.push(
        new TableRow({
          children: [
            cell(left),
            cell(mappings.length > 0 ? mappings : [paragraph("No reference documents were available.")]),
          ],
        }),
      );
    });
  }

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "CONFIDENTIAL", bold: true, color: HEADER_BLUE, size: 18 })],
              }),
            ],
          }),
        },
        children: [
          paragraph("Claim chart", { bold: true, color: HEADER_BLUE, size: 32 }),
          paragraph(chart.disclaimer, { size: 18, color: "666666" }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [4200, 5160],
            rows,
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export function renderPdf(chart: ClaimChart): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fillColor("#0070C0").fontSize(10).text("CONFIDENTIAL", { align: "right" });
    doc.moveDown(0.4);
    doc.fontSize(18).text("Claim chart");
    doc.moveDown(0.3);
    doc.fillColor("#666666").fontSize(9).text(chart.disclaimer);
    doc.fillColor("#333333").moveDown();
    doc.fontSize(12).text(`Patent number: ${chart.targetTitle || chart.projectName}`);
    doc.fontSize(11).text(`Matter: ${chart.projectName}`);
    doc.moveDown(0.4);
    doc.fontSize(11).text("Standards / references");
    if (chart.priorArt.length === 0) doc.fontSize(10).text("No reference documents were uploaded.");
    chart.priorArt.forEach((document, index) => doc.fontSize(10).text(`${index + 1}. ${document.title}`));
    doc.moveDown();

    const claimNumbers = [...new Set(chart.elements.map((element) => element.claimNumber))];
    for (const claimNumber of claimNumbers) {
      const elements = chart.elements.filter((element) => element.claimNumber === claimNumber);
      const preamble = isPreamble(elements[0]?.text ?? "", 0);
      elements.forEach((element, index) => {
        const label = preamble && index === 0 ? `Claim ${claimNumber}` : `Clause ${preamble ? index : index + 1}`;
        doc.fillColor("#0070C0").fontSize(13).text(label);
        writeColored(doc, element.text, chart.priorArt.flatMap((document) => bestEvidence(chart, element.id, document.id)?.alignments ?? []), "claimPhrase");
        for (const document of chart.priorArt) {
          const evidence = bestEvidence(chart, element.id, document.id);
          doc.fillColor("#0070C0").fontSize(10).text(document.title);
          if (!evidence) {
            doc.fillColor("#333333").fontSize(10).text("No corresponding passage was identified.");
            continue;
          }
          writeColored(doc, evidence.text, evidence.alignments, "sourcePhrase");
          doc.fillColor("#666666").fontSize(9).text(`Page ${evidence.pageNumber}`);
          doc.fillColor("#333333").fontSize(10).text(evidence.explanation);
          if (evidence.analystNote) doc.fontSize(10).text(`Analyst note: ${evidence.analystNote}`);
        }
        doc.moveDown();
      });
    }
    doc.end();
  });
}

function writeColored(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  alignments: PhraseAlignment[],
  field: "claimPhrase" | "sourcePhrase",
) {
  const parts = quoteParts(text, alignments, field);
  const source = parts.length > 0 ? parts : [{ text, color: null as string | null }];
  doc.fontSize(10);
  const lineHeight = 14;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  let x = doc.x;
  let y = doc.y;
  const tokens: TextPart[] = [];
  for (const part of source) {
    for (const piece of part.text.split(/(\s+)/)) {
      if (piece.length > 0) tokens.push({ text: piece, color: part.color });
    }
  }
  for (const token of tokens) {
    const width = doc.widthOfString(token.text);
    if (token.text.trim().length > 0 && x > left && x + width > right) {
      x = left;
      y += lineHeight;
    }
    if (y + lineHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      x = doc.page.margins.left;
      y = doc.page.margins.top;
    }
    if (token.color && token.text.trim().length > 0) {
      doc.save();
      doc.rect(x, y - 1, width, lineHeight - 2).fill(`#${token.color}`);
      doc.restore();
    }
    doc.fillColor("#333333").text(token.text, x, y, { lineBreak: false });
    x += width;
  }
  doc.x = left;
  doc.y = y + lineHeight;
}
