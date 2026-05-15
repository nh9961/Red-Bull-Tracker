import ExcelJS from "exceljs";
import { flavourMeta } from "../data/flavours";
import type { EntryDraft, ImportPreview, ImportPreviewRow, RedBullEntry } from "../types";
import {
  caffeineFor,
  caffeinePerCan,
  currency,
  makeImportKey,
  oneDecimal,
  spendFor,
  sugarFor,
  sum,
  topByCans,
  wholeNumber,
} from "./metrics";

const WORKBOOK_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ENTRIES_SHEET = "Intake Entries";
const SUMMARY_SHEET = "Summary";
const MIKU_BLUE = "FF39D5FF";
const PASTEL_PINK = "FFFFB7D9";
const MIDNIGHT = "FF0B1022";
const CHROME = "FFE8ECF4";
const RED_BULL_RED = "FFFF3448";
const RED_BULL_YELLOW = "FFFFD84D";

const ENTRY_COLUMNS = [
  { header: "Date", key: "date", width: 14 },
  { header: "Time", key: "time", width: 12 },
  { header: "Flavour", key: "flavour", width: 22 },
  { header: "Size", key: "size", width: 12 },
  { header: "Cans", key: "cans", width: 10 },
  { header: "Price per can", key: "pricePerCan", width: 16 },
  { header: "Total cost", key: "totalCost", width: 15 },
  { header: "Caffeine", key: "caffeine", width: 15 },
  { header: "Sugar estimate", key: "sugar", width: 17 },
  { header: "Store/location", key: "store", width: 24 },
  { header: "Notes", key: "notes", width: 36 },
] as const;

export async function createExcelExport(entries: RedBullEntry[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Red Bull Intake Tracker";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  addEntriesSheet(workbook, entries);
  addSummarySheet(workbook, entries);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: WORKBOOK_MIME });
}

export async function parseExcelImport(file: File, existingEntries: RedBullEntry[]): Promise<ImportPreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const worksheet = workbook.getWorksheet(ENTRIES_SHEET) ?? workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No worksheet found in that Excel file.");
  }

  const headers = headerMap(worksheet.getRow(1));
  const rows: ImportPreviewRow[] = [];
  const seen = new Set(existingEntries.map((entry) => entry.importKey || makeImportKey(entry)));

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rowIsBlank(row)) return;
    const label = stringCell(row.getCell(headers.date ?? 1).value).trim().toLowerCase();
    if (label === "totals" || label === "total") return;

    const result = parseEntryRow(row, headers, rowNumber);
    if (!result.entry || result.errors.length) {
      rows.push(result);
      return;
    }

    const key = makeImportKey({
      ...result.entry,
      dateTime: new Date(result.entry.dateTime).toISOString(),
      notes: result.entry.notes ?? "",
      store: result.entry.store ?? "",
    });
    const duplicate = seen.has(key);
    rows.push({
      ...result,
      duplicate,
      duplicateReason: duplicate ? "Matches an existing or earlier imported row." : undefined,
    });

    if (!duplicate) seen.add(key);
  });

  return { fileName: file.name, rows };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function addEntriesSheet(workbook: ExcelJS.Workbook, entries: RedBullEntry[]) {
  const worksheet = workbook.addWorksheet(ENTRIES_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 22 },
  });
  worksheet.columns = [...ENTRY_COLUMNS];

  const header = worksheet.getRow(1);
  header.height = 28;
  header.eachCell((cell, index) => {
    styleHeaderCell(cell, index % 2 === 0 ? PASTEL_PINK : MIKU_BLUE);
  });

  entries
    .slice()
    .sort((left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime())
    .forEach((entry) => {
      const date = new Date(entry.dateTime);
      worksheet.addRow({
        date: toDateLabel(date),
        time: toTimeLabel(date),
        flavour: entry.flavour,
        size: `${entry.sizeMl}ml`,
        cans: entry.cans,
        pricePerCan: entry.pricePerCan,
        totalCost: spendFor(entry),
        caffeine: caffeineFor(entry),
        sugar: sugarFor(entry),
        store: entry.store ?? "",
        notes: entry.notes ?? "",
      });
    });

  const totals = worksheet.addRow({
    date: "Totals",
    cans: sum(entries, (entry) => entry.cans),
    totalCost: sum(entries, spendFor),
    caffeine: sum(entries, caffeineFor),
    sugar: sum(entries, sugarFor),
  });
  totals.font = { bold: true, color: { argb: MIDNIGHT } };
  totals.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CHROME } };

  worksheet.getColumn("pricePerCan").numFmt = '"£"#,##0.00';
  worksheet.getColumn("totalCost").numFmt = '"£"#,##0.00';
  worksheet.getColumn("caffeine").numFmt = '0"mg"';
  worksheet.getColumn("sugar").numFmt = '0.0"g"';
  worksheet.getColumn("cans").numFmt = "0.00";
  worksheet.autoFilter = {
    from: "A1",
    to: `K${Math.max(1, worksheet.rowCount)}`,
  };
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = lightBorder();
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  });

  autoWidth(worksheet);
}

function addSummarySheet(workbook: ExcelJS.Workbook, entries: RedBullEntry[]) {
  const worksheet = workbook.addWorksheet(SUMMARY_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 24 },
  });

  worksheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 26 },
  ];
  worksheet.getRow(1).eachCell((cell, index) => {
    styleHeaderCell(cell, index === 1 ? MIKU_BLUE : PASTEL_PINK);
  });

  const summaryRows = [
    ["Exported at", new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date())],
    ["Entries", entries.length],
    ["Total cans", oneDecimal.format(sum(entries, (entry) => entry.cans))],
    ["Total cost", currency.format(sum(entries, spendFor))],
    ["Estimated caffeine", `${wholeNumber.format(sum(entries, caffeineFor))}mg`],
    ["Estimated sugar", `${oneDecimal.format(sum(entries, sugarFor))}g`],
    ["Favourite flavour", topByCans(entries)],
  ];

  summaryRows.forEach(([metric, value]) => worksheet.addRow({ metric, value }));

  worksheet.addRow({});
  const byFlavourHeader = worksheet.addRow({ metric: "Flavour", value: "Cans" });
  byFlavourHeader.eachCell((cell, index) => styleHeaderCell(cell, index === 1 ? RED_BULL_RED : RED_BULL_YELLOW));

  const flavourTotals = new Map<string, number>();
  entries.forEach((entry) => {
    flavourTotals.set(entry.flavour, (flavourTotals.get(entry.flavour) ?? 0) + entry.cans);
  });
  [...flavourTotals.entries()]
    .sort((left, right) => right[1] - left[1])
    .forEach(([metric, value]) => worksheet.addRow({ metric, value: oneDecimal.format(value) }));

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = lightBorder();
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  });
  autoWidth(worksheet);
}

function parseEntryRow(row: ExcelJS.Row, headers: Record<string, number>, rowNumber: number): ImportPreviewRow {
  const errors: string[] = [];
  const dateValue = cellAt(row, headers.date);
  const timeValue = cellAt(row, headers.time);
  const flavour = stringCell(cellAt(row, headers.flavour)).trim();
  const sizeMl = parseSize(stringCell(cellAt(row, headers.size)));
  const cans = parseNumber(cellAt(row, headers.cans));
  const pricePerCan = parseNumber(cellAt(row, headers.pricePerCan));
  const caffeineTotal = parseNumber(cellAt(row, headers.caffeine));
  const store = stringCell(cellAt(row, headers.store)).trim();
  const notes = stringCell(cellAt(row, headers.notes)).trim();
  const dateTime = parseDateTime(dateValue, timeValue);

  if (!dateTime) errors.push("Date/time is invalid or missing.");
  if (!flavour) errors.push("Flavour is required.");
  if (!Number.isFinite(sizeMl) || sizeMl <= 0) errors.push("Size must be a positive ml value.");
  if (!Number.isFinite(cans) || cans <= 0) errors.push("Cans must be greater than zero.");
  if (!Number.isFinite(pricePerCan) || pricePerCan < 0) errors.push("Price per can must be zero or more.");

  if (errors.length || !dateTime) {
    return { rowNumber, errors, duplicate: false };
  }

  const meta = flavourMeta(flavour);
  const caffeineOverride = Number.isFinite(caffeineTotal) && caffeineTotal > 0 ? caffeineTotal / cans : undefined;
  const entry: EntryDraft = {
    cans,
    flavour,
    flavourAccent: meta.accent,
    sizeMl,
    pricePerCan,
    dateTime,
    notes,
    store,
    sugarFree: Boolean(meta.sugarFree),
    caffeineMgPerCan: caffeineOverride && Math.abs(caffeineOverride - caffeinePerCan(sizeMl)) > 0.5 ? caffeineOverride : undefined,
    source: "excel",
  };

  return { rowNumber, entry, errors, duplicate: false };
}

function headerMap(row: ExcelJS.Row) {
  const map: Record<string, number> = {};
  row.eachCell((cell, columnNumber) => {
    const key = normaliseHeader(stringCell(cell.value));
    if (key) map[key] = columnNumber;
  });
  return map;
}

function normaliseHeader(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z]/g, "");
  const aliases: Record<string, string> = {
    date: "date",
    time: "time",
    flavour: "flavour",
    flavor: "flavour",
    size: "size",
    cans: "cans",
    pricepercan: "pricePerCan",
    totalcost: "totalCost",
    caffeine: "caffeine",
    sugarestimate: "sugar",
    storelocation: "store",
    store: "store",
    location: "store",
    notes: "notes",
  };
  return aliases[clean];
}

function rowIsBlank(row: ExcelJS.Row) {
  let hasValue = false;
  row.eachCell((cell) => {
    if (stringCell(cell.value).trim()) hasValue = true;
  });
  return !hasValue;
}

function parseDateTime(dateValue: ExcelJS.CellValue, timeValue: ExcelJS.CellValue) {
  const dateString = stringCell(dateValue).trim();
  const timeString = stringCell(timeValue).trim();

  if (!dateString) return null;
  if (dateValue instanceof Date) {
    const date = new Date(dateValue);
    const time = parseTimeParts(timeValue);
    if (time) date.setHours(time.hours, time.minutes, 0, 0);
    return date.toISOString();
  }

  const isoDate = dateString.includes("T") ? dateString : `${dateString}T${timeString || "00:00"}`;
  const parsed = new Date(isoDate);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  const gbParts = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (gbParts) {
    const [, day, month, year] = gbParts;
    const parsedGb = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${timeString || "00:00"}`);
    if (!Number.isNaN(parsedGb.getTime())) return parsedGb.toISOString();
  }

  return null;
}

function parseTimeParts(value: ExcelJS.CellValue) {
  if (value instanceof Date) return { hours: value.getHours(), minutes: value.getMinutes() };
  const text = stringCell(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

function parseSize(value: string) {
  return parseNumber(value.replace(/ml/i, ""));
}

function parseNumber(value: ExcelJS.CellValue | string) {
  if (typeof value === "number") return value;
  const text = typeof value === "string" ? value : stringCell(value);
  const clean = text.replace(/[£,$mg]/gi, "").replace(/g$/i, "").trim();
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function cellAt(row: ExcelJS.Row, index: number | undefined) {
  return index ? row.getCell(index).value : null;
}

function stringCell(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return toDateLabel(value);
  if (typeof value === "object") {
    if ("result" in value) return stringCell(value.result as ExcelJS.CellValue);
    if ("text" in value) return value.text;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("hyperlink" in value && "text" in value) return String(value.text);
  }
  return String(value);
}

function toDateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toTimeLabel(date: Date) {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function styleHeaderCell(cell: ExcelJS.Cell, fill: string) {
  cell.font = { bold: true, color: { argb: MIDNIGHT } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.border = lightBorder();
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function lightBorder() {
  return {
    top: { style: "thin", color: { argb: "FFD6E4F0" } },
    left: { style: "thin", color: { argb: "FFD6E4F0" } },
    bottom: { style: "thin", color: { argb: "FFD6E4F0" } },
    right: { style: "thin", color: { argb: "FFD6E4F0" } },
  } satisfies Partial<ExcelJS.Borders>;
}

function autoWidth(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      maxLength = Math.max(maxLength, stringCell(cell.value).length);
    });
    column.width = Math.min(Math.max(maxLength + 2, column.width ?? 12), 44);
  });
}
