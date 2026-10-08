import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import PDFDocument from "pdfkit";
import { RELATIONSHIP_LABELS, type ClaimChart, type EvidenceRelationship } from "@patent/shared";

function label(value: string): string {
  if (value in RELATIONSHIP_LABELS) return RELATIONSHIP_LABELS[value as EvidenceRelationship];
  return value;
}

export async function renderDocx(chart: ClaimChart): Promise<Buffer> {
  const header = [
    "Element",
    ...chart.priorArt.map((document) => document.title),
  ];
  const rows = [
    new TableRow({
      children: header.map((text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] })),
    }),
    ...chart.elements.map((element) => {
      const cells = [
        `${element.key}. ${element.text}`,
        ...chart.priorArt.map((document) => {
          const cell = chart.cells.find(
            (item) => item.elementId === element.id && item.documentId === document.id,
          );
          return cell ? label(cell.relationship) : "No evidence identified";
        }),
      ];
      return new TableRow({
        children: cells.map((text) => new TableCell({ children: [new Paragraph(text)] })),
      });
    }),
  ];

  const appendix = chart.cells.flatMap((cell) => {
    const element = chart.elements.find((item) => item.id === cell.elementId);
    const document = chart.priorArt.find((item) => item.id === cell.documentId);
    return cell.evidence.flatMap((item) => [
      new Paragraph({
        children: [
          new TextRun({
            text: `${element?.key ?? "Element"} · ${document?.title ?? "Prior art"} · page ${item.pageNumber}`,
            bold: true,
          }),
        ],
      }),
      new Paragraph(item.text || "No quoted passage was stored."),
      new Paragraph(item.explanation),
      new Paragraph(""),
    ]);
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: chart.projectName, heading: HeadingLevel.HEADING_1 }),
          new Paragraph("Claim chart — research assistance"),
          new Paragraph(chart.disclaimer),
          new Paragraph(""),
          new Table({ rows }),
          new Paragraph({ text: "Evidence appendix", heading: HeadingLevel.HEADING_2 }),
          ...appendix,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export function renderPdf(chart: ClaimChart): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).text(chart.projectName);
    doc.moveDown(0.4);
    doc.fontSize(11).text("Claim chart — research assistance");
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor("#444444").text(chart.disclaimer);
    doc.fillColor("#111111").moveDown();
    for (const element of chart.elements) {
      doc.fontSize(12).text(`${element.key}. ${element.text}`);
      for (const document of chart.priorArt) {
        const cell = chart.cells.find(
          (item) => item.elementId === element.id && item.documentId === document.id,
        );
        doc.fontSize(10).text(`${document.title}: ${cell ? label(cell.relationship) : "No evidence identified"}`);
        for (const item of cell?.evidence ?? []) {
          doc.fontSize(9).text(`Page ${item.pageNumber}: ${item.text}`);
          doc.fontSize(9).fillColor("#444444").text(item.explanation);
          doc.fillColor("#111111");
        }
      }
      doc.moveDown();
    }
    doc.end();
  });
}
