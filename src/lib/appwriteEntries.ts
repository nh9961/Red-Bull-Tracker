import type { Models } from "appwrite";
import { flavourMeta } from "../data/flavours";
import type { EntryDraft, RedBullEntry } from "../types";
import { appwriteConfig, ID, Permission, Query, Role, tablesDB } from "./appwrite";
import { makeId, makeImportKey } from "./metrics";

type EntryRow = Models.Row & {
  userId: string;
  cans: number;
  flavour: string;
  flavourAccent: string;
  sizeMl: number;
  pricePerCan: number;
  dateTime: string;
  notes?: string;
  store?: string;
  sugarFree: boolean;
  caffeineMgPerCan?: number;
  importKey: string;
  source: RedBullEntry["source"];
};

export async function listEntries(userId: string) {
  const rows: EntryRow[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const response = await tablesDB.listRows<EntryRow>({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.collectionId,
      queries: [
        Query.equal("userId", userId),
        Query.orderDesc("dateTime"),
        Query.limit(limit),
        Query.offset(offset),
      ],
    });

    rows.push(...response.rows);
    if (response.rows.length < limit) break;
    offset += limit;
  }

  return rows.map(fromRow);
}

export async function createEntry(userId: string, draft: EntryDraft) {
  const entry = buildEntry(userId, draft);

  const row = await tablesDB.createRow<EntryRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.collectionId,
    rowId: ID.custom(entry.id),
    data: toRowData(entry),
    permissions: userRowPermissions(userId),
  });

  return fromRow(row);
}

export async function createEntries(userId: string, drafts: EntryDraft[]) {
  const saved: RedBullEntry[] = [];
  for (const draft of drafts) {
    saved.push(await createEntry(userId, draft));
  }
  return saved;
}

export async function updateEntry(userId: string, id: string, draft: EntryDraft) {
  const entry = buildEntry(userId, draft, id);
  const row = await tablesDB.updateRow<EntryRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.collectionId,
    rowId: id,
    data: toRowData(entry),
    permissions: userRowPermissions(userId),
  });

  return fromRow(row);
}

export async function deleteEntry(id: string) {
  await tablesDB.deleteRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.collectionId,
    rowId: id,
  });
}

export function buildEntry(userId: string, draft: EntryDraft, id: string = makeId()): RedBullEntry {
  const meta = flavourMeta(draft.flavour);
  const entry: RedBullEntry = {
    id,
    userId,
    cans: draft.cans,
    flavour: draft.flavour,
    flavourAccent: draft.flavourAccent || meta.accent,
    sizeMl: draft.sizeMl,
    pricePerCan: draft.pricePerCan,
    dateTime: new Date(draft.dateTime).toISOString(),
    notes: draft.notes ?? "",
    store: draft.store ?? "",
    sugarFree: draft.sugarFree || Boolean(meta.sugarFree),
    caffeineMgPerCan: draft.caffeineMgPerCan,
    importKey: "",
    source: draft.source ?? "manual",
  };

  entry.importKey = makeImportKey(entry);
  return entry;
}

export function isDuplicateDraft(existing: RedBullEntry[], draft: EntryDraft) {
  const key = makeImportKey({
    ...draft,
    dateTime: new Date(draft.dateTime).toISOString(),
    notes: draft.notes ?? "",
    store: draft.store ?? "",
  });
  return existing.some((entry) => entry.importKey === key || makeImportKey(entry) === key);
}

export function appwriteErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/permissions?.*create|action 'create'|create.*permissions?/i.test(error.message)) {
      return "Appwrite table permissions need Users -> Create, with Row Security enabled on intake_entries.";
    }
    if (/not authorized|401|unauthorized/i.test(error.message)) {
      return "Appwrite denied the table request. Enable Row Security on intake_entries and grant table-level Users -> Create; rows are then read by per-user row permissions.";
    }
    return error.message;
  }
  return "Appwrite request failed.";
}

function fromRow(row: EntryRow): RedBullEntry {
  return {
    id: row.$id,
    userId: row.userId,
    cans: row.cans,
    flavour: row.flavour,
    flavourAccent: row.flavourAccent,
    sizeMl: row.sizeMl,
    pricePerCan: row.pricePerCan,
    dateTime: row.dateTime,
    notes: row.notes ?? "",
    store: row.store ?? "",
    sugarFree: row.sugarFree,
    caffeineMgPerCan: row.caffeineMgPerCan,
    importKey: row.importKey || makeImportKey(row),
    source: row.source ?? "manual",
    createdAt: row.$createdAt,
    updatedAt: row.$updatedAt,
  };
}

function toRowData(entry: RedBullEntry) {
  return {
    userId: entry.userId,
    cans: entry.cans,
    flavour: entry.flavour,
    flavourAccent: entry.flavourAccent,
    sizeMl: entry.sizeMl,
    pricePerCan: entry.pricePerCan,
    dateTime: entry.dateTime,
    notes: entry.notes ?? "",
    store: entry.store ?? "",
    sugarFree: entry.sugarFree,
    caffeineMgPerCan: entry.caffeineMgPerCan,
    importKey: entry.importKey,
    source: entry.source,
  };
}

function userRowPermissions(userId: string) {
  const role = Role.user(userId);
  return [Permission.read(role), Permission.update(role), Permission.delete(role)];
}
