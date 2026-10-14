import {
  AlignmentType, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { docxToPdf } from "./docx-pdf";
import { EXHIBIT_SUBTITLE, EXHIBIT_TITLE } from "./inventions";

// The Exhibit A document: heading, a three-column table of prior inventions, and a
// signature / name / date block. Rendered on demand from the user's stored entries.

type ExhibitEntry = {
  title: string;
  description: string;
  inventionDate: string | null;
  identifier: string | null;
};

const FONT = "Arial";
const run = (text: string, opts: { bold?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? 20, bold: opts.bold });

function cell(paragraphs: Paragraph[], widthPct: number) {
  return new TableCell({ width: { size: widthPct, type: WidthType.PERCENTAGE }, children: paragraphs });
}

const COLUMNS: [string, number][] = [
  ["Title", 30],
  ["Date", 15],
  ["Identifying number or brief description", 55],
];

function entryTable(entries: ExhibitEntry[]) {
  const header = new TableRow({
    tableHeader: true,
    children: COLUMNS.map(([label, w]) => cell([new Paragraph({ children: [run(label, { bold: true })] })], w)),
  });
  const rows = entries.map(
    (e) =>
      new TableRow({
        children: [
          cell([new Paragraph({ children: [run(e.title)] })], COLUMNS[0][1]),
          cell([new Paragraph({ children: [run(e.inventionDate ?? "")] })], COLUMNS[1][1]),
          cell(
            [
              ...(e.identifier ? [new Paragraph({ children: [run(e.identifier)] })] : []),
              new Paragraph({ children: [run(e.description.trim())] }),
            ],
            COLUMNS[2][1],
          ),
        ],
      }),
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] });
}

const signatureLine = (label: string, value = "______________________________") =>
  new Paragraph({ spacing: { before: 240 }, children: [run(`${label}: `, { bold: true }), run(value)] });

export async function buildExhibitDocx(entries: ExhibitEntry[], ownerName: string | null): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [run(EXHIBIT_TITLE, { bold: true, size: 28 })] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [run(EXHIBIT_SUBTITLE, { bold: true, size: 22 })],
          }),
          entries.length
            ? entryTable(entries)
            : new Paragraph({ children: [run("No prior inventions or original works of authorship to disclose.")] }),
          signatureLine("Signature"),
          signatureLine("Name", ownerName ?? undefined),
          signatureLine("Date"),
        ],
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

export async function renderExhibit(entries: ExhibitEntry[], ownerName: string | null) {
  const docx = await buildExhibitDocx(entries, ownerName);
  const pdf = await docxToPdf(docx, "exhibit-a");
  return { docx, pdf };
}
