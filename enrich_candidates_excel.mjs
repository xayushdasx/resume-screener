import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const attachmentPath =
  "C:/Users/ayush/.codex/attachments/952e51c1-985f-42f0-b714-d0010beb8809/pasted-text.txt";
const workbookPath =
  "C:/Users/ayush/Desktop/resume-screener/outputs/952e51c1-985f-42f0-b714-d0010beb8809/candidate_screening.xlsx";
const contactsPath =
  "C:/Users/ayush/Desktop/resume-screener/outputs/952e51c1-985f-42f0-b714-d0010beb8809/p0_p1_contacts.json";
const outputDir =
  "C:/Users/ayush/Desktop/resume-screener/outputs/952e51c1-985f-42f0-b714-d0010beb8809";
const outputPath = path.join(outputDir, "candidate_screening_verified_contacts.xlsx");

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
      const profile = ratingIndex > 2 ? record.slice(2, ratingIndex).join(" ").trim() : "";
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

function keyFor(row) {
  return [row.candidate, row.rating, row.profile].join("||");
}

function asText(value) {
  return value ? String(value) : "";
}

const manualOverrides = new Map([
  [
    "Shaik Muhammadasaif||P1||Data Science Intern at Naresh IT, Hyderabad",
    {
      verifiedName: "SHAIK MUHAMMADSAIF",
      email: "sksaif1272003@gmail.com",
      phone: "+917731963050",
      resumeFile: "41618652-Saif_fresher_cv.pdf.pdf",
    },
  ],
]);

try {
  const rawText = await fs.readFile(attachmentPath, "utf8");
  const sourceRows = parseRows(rawText);
  const contacts = JSON.parse(await fs.readFile(contactsPath, "utf8"));
  const contactsMap = new Map();

  for (const entry of contacts) {
    const key = keyFor(entry);
    contactsMap.set(key, {
      verifiedName: entry.verifiedName || "",
      email: entry.email || "",
      phone: entry.phone || "",
      resumeFile: entry.resumeFile || "",
    });
  }

  for (const [key, value] of manualOverrides.entries()) {
    contactsMap.set(key, value);
  }

  const input = await FileBlob.load(workbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheet = workbook.worksheets.getItem("Candidates");

  sheet.getRange("J1:M1").values = [[
    "Verified Resume Name",
    "Email ID",
    "Phone Number",
    "Resume File",
  ]];

  sheet.getRange("J1:M1").format = {
    fill: "#1D4ED8",
    font: { bold: true, color: "#FFFFFF", size: 11 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };

  const contactRows = sourceRows.map((row) => {
    const key = keyFor(row);
    const contact = contactsMap.get(key) ?? {};
    const fallbackEmail = /@/.test(row.profile) ? row.profile : "";

    if (!/^(P0|P1)$/i.test(row.rating)) {
      return ["", "", "", ""];
    }

    return [
      asText(contact.verifiedName),
      asText(contact.email || fallbackEmail),
      asText(contact.phone),
      asText(contact.resumeFile),
    ];
  });

  sheet.getRange(`J2:M${sourceRows.length + 1}`).format.numberFormat = "@";
  sheet.getRange(`J2:M${sourceRows.length + 1}`).values = contactRows;
  sheet.getRange(`J2:M${sourceRows.length + 1}`).format.numberFormat = "@";
  sheet.getRange(`J2:M${sourceRows.length + 1}`).format.wrapText = true;
  sheet.getRange(`J1:M${sourceRows.length + 1}`).format.borders = {
    preset: "all",
    style: "thin",
    color: "#D1D5DB",
  };

  const widths = [220, 220, 140, 280];
  for (let i = 0; i < widths.length; i += 1) {
    sheet.getRangeByIndexes(0, 9 + i, sourceRows.length + 1, 1).format.columnWidthPx = widths[i];
  }

  sheet.getRange(`K2:K${sourceRows.length + 1}`).format.font = { color: "#1D4ED8" };
  sheet.getRange(`L2:L${sourceRows.length + 1}`).format.horizontalAlignment = "center";
  sheet.getRange(`J2:M${sourceRows.length + 1}`).format.autofitRows();

  const inspection = await workbook.inspect({
    kind: "table",
    range: "Candidates!A1:M12",
    include: "values",
    tableMaxRows: 12,
    tableMaxCols: 13,
  });
  console.log(inspection.ndjson);

  await fs.mkdir(outputDir, { recursive: true });
  const preview = await workbook.render({
    sheetName: "Candidates",
    range: "A1:M18",
    scale: 2,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, "candidate_screening_verified_contacts_preview.png"),
    new Uint8Array(await preview.arrayBuffer()),
  );

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputPath);

  const missingContacts = contactRows.filter((row) => /.+/.test(row[1] + row[2]) === false).length;
  console.log(JSON.stringify({ outputPath, sourceRows: sourceRows.length, p0p1Rows: contacts.length, extractedWithMissingFields: missingContacts }, null, 2));
} catch (error) {
  console.error("ENRICH_ERROR", error?.message || error);
  if (error?.stack) {
    console.error(String(error.stack).split("\n").slice(0, 8).join("\n"));
  }
  process.exit(1);
}
