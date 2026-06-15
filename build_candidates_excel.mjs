import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const attachmentPath =
  "C:/Users/ayush/.codex/attachments/952e51c1-985f-42f0-b714-d0010beb8809/pasted-text.txt";
const outputDir =
  "C:/Users/ayush/Desktop/resume-screener/outputs/952e51c1-985f-42f0-b714-d0010beb8809";
const outputPath = path.join(outputDir, "candidate_screening.xlsx");

function cleanLine(line) {
  return line
    .replace(/\u00a0/g, " ")
    .replace(/â€™/g, "'")
    .replace(/â€“|â€”|âˆ’/g, "-")
    .replace(/â˜…/g, "★")
    .trim();
}

function parseRows(rawText) {
  const normalized = rawText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map(cleanLine);
  const startIndex = lines.findIndex((line) => line === "Screened");
  const dataLines = lines.slice(startIndex + 1);

  const rows = [];
  let buffer = [];

  for (const line of dataLines) {
    if (line === "View") {
      const record = buffer.filter(Boolean);
      buffer = [];
      if (!record.length) continue;

      const initial = record[0] ?? "";
      const candidate = record[1] ?? "";
      const ratingIndex = record.findIndex((value, index) => index >= 2 && /^(P0|P1|Reject)$/i.test(value));
      const statusIndex = record.findIndex(
        (value, index) => index > ratingIndex && /^(Shortlisted|Rejected)$/i.test(value),
      );
      const screened = record.at(-1) ?? "";
      const college = record.at(-2) ?? "";
      const experience = record.at(-3) ?? "";
      const profile =
        ratingIndex > 2 ? record.slice(2, ratingIndex).join(" ").trim() : "";
      const topReason =
        statusIndex > -1 ? record.slice(statusIndex + 1, Math.max(statusIndex + 1, record.length - 3)).join(" ").trim() : "";
      const rating = ratingIndex > -1 ? record[ratingIndex] : "";
      const status = statusIndex > -1 ? record[statusIndex] : "";

      rows.push({
        initial,
        candidate,
        profile,
        rating,
        status,
        topReason,
        experience,
        college,
        screened,
      });
      continue;
    }

    buffer.push(line);
  }

  return rows;
}

function getStatusColor(status) {
  if (/shortlisted/i.test(status)) return "#DCFCE7";
  if (/rejected/i.test(status)) return "#FEE2E2";
  return "#E5E7EB";
}

function getRatingColor(rating) {
  if (/^P0$/i.test(rating)) return "#D1FAE5";
  if (/^P1$/i.test(rating)) return "#FEF3C7";
  if (/reject/i.test(rating)) return "#FEE2E2";
  return "#E5E7EB";
}

const rawText = await fs.readFile(attachmentPath, "utf8");
const rows = parseRows(rawText);

if (!rows.length) {
  throw new Error("No candidate rows were parsed from the pasted text.");
}

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Candidates");
sheet.freezePanes.freezeRows(1);

const headers = [
  "Initial",
  "Candidate",
  "Profile / Email / Source",
  "Rating",
  "Status",
  "Top Reason",
  "Experience",
  "College",
  "Screened",
];

sheet.getRange("A1:I1").values = [headers];
sheet.getRange(`A2:I${rows.length + 1}`).values = rows.map((row) => [
  row.initial,
  row.candidate,
  row.profile,
  row.rating,
  row.status,
  row.topReason,
  row.experience,
  row.college,
  row.screened,
]);

sheet.getRange(`A1:I${rows.length + 1}`).format = {
  font: { name: "Calibri", size: 11, color: "#111827" },
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: "#D1D5DB" },
};

sheet.getRange("A1:I1").format = {
  fill: "#0F766E",
  font: { bold: true, color: "#FFFFFF", size: 11 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange("A1:I1").format.rowHeightPx = 28;

const colWidths = [60, 180, 260, 70, 95, 320, 90, 250, 85];
for (let i = 0; i < colWidths.length; i += 1) {
  sheet.getRangeByIndexes(0, i, rows.length + 1, 1).format.columnWidthPx = colWidths[i];
}

sheet.getRange(`A2:A${rows.length + 1}`).format.horizontalAlignment = "center";
sheet.getRange(`D2:E${rows.length + 1}`).format.horizontalAlignment = "center";
sheet.getRange(`G2:G${rows.length + 1}`).format.horizontalAlignment = "center";
sheet.getRange(`I2:I${rows.length + 1}`).format.horizontalAlignment = "center";

for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
  const excelRow = rowIndex + 2;
  const bandFill = rowIndex % 2 === 0 ? "#FFFFFF" : "#F8FAFC";

  sheet.getRange(`A${excelRow}:I${excelRow}`).format.fill = bandFill;
  sheet.getRange(`D${excelRow}`).format.fill = getRatingColor(rows[rowIndex].rating);
  sheet.getRange(`E${excelRow}`).format.fill = getStatusColor(rows[rowIndex].status);
}

const used = sheet.getUsedRange();
used.format.autofitRows();

const inspection = await workbook.inspect({
  kind: "table",
  range: `Candidates!A1:I12`,
  include: "values",
  tableMaxRows: 12,
  tableMaxCols: 9,
});
console.log(inspection.ndjson);

await fs.mkdir(outputDir, { recursive: true });

const preview = await workbook.render({
  sheetName: "Candidates",
  range: `A1:I20`,
  scale: 2,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "candidate_screening_preview.png"),
  new Uint8Array(await preview.arrayBuffer()),
);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);

console.log(JSON.stringify({ rowCount: rows.length, outputPath }, null, 2));
