import { flavourMeta } from "../data/flavours";
import type { EntryDraft, RedBullEntry } from "../types";

export function exportPayload(entries: RedBullEntry[]) {
  return JSON.stringify(
    {
      app: "Red Bull Intake Tracker",
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
    },
    null,
    2,
  );
}

export function parseImport(raw: string): EntryDraft[] {
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
  if (!Array.isArray(entries)) {
    throw new Error("Import file does not contain an entries array.");
  }

  const valid = entries.map(coerceEntryDraft).filter(Boolean) as EntryDraft[];
  if (!valid.length && entries.length) {
    throw new Error("No valid Red Bull entries were found in that file.");
  }
  return valid;
}

function coerceEntryDraft(value: unknown): EntryDraft | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<RedBullEntry>;
  if (
    typeof entry.cans !== "number" ||
    typeof entry.flavour !== "string" ||
    typeof entry.sizeMl !== "number" ||
    typeof entry.pricePerCan !== "number" ||
    typeof entry.dateTime !== "string"
  ) {
    return null;
  }

  const meta = flavourMeta(entry.flavour);
  const draft: EntryDraft = {
    cans: entry.cans,
    flavour: entry.flavour,
    flavourAccent: entry.flavourAccent ?? meta.accent,
    sizeMl: entry.sizeMl,
    pricePerCan: entry.pricePerCan,
    dateTime: entry.dateTime,
    notes: entry.notes ?? "",
    store: entry.store ?? "",
    sugarFree: entry.sugarFree ?? Boolean(meta.sugarFree),
    caffeineMgPerCan: entry.caffeineMgPerCan,
    source: "json",
  };

  return draft;
}
