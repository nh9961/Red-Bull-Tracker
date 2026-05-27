import { normalizeBarcode } from "./barcodeLookup";
import type { BarcodeProductDraft, UserBarcodeMapping } from "../types";

const STORAGE_PREFIX = "red-bull-barcode-mappings:v1";

export function loadUserBarcodeMappings(userId: string) {
  const raw = localStorage.getItem(storageKey(userId));
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isUserBarcodeMapping);
  } catch {
    return [];
  }
}

export function saveUserBarcodeMappings(userId: string, mappings: UserBarcodeMapping[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(mappings));
}

export function upsertUserBarcodeMapping(
  userId: string,
  barcodeValue: string,
  product: BarcodeProductDraft,
) {
  const barcode = normalizeBarcode(barcodeValue);
  const now = new Date().toISOString();
  const mappings = loadUserBarcodeMappings(userId);
  const existing = mappings.find((mapping) => mapping.barcode === barcode);
  const nextMapping: UserBarcodeMapping = {
    ...product,
    barcode,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const nextMappings = existing
    ? mappings.map((mapping) => (mapping.barcode === barcode ? nextMapping : mapping))
    : [...mappings, nextMapping];

  saveUserBarcodeMappings(userId, nextMappings);
  return nextMapping;
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function isUserBarcodeMapping(value: unknown): value is UserBarcodeMapping {
  if (!value || typeof value !== "object") return false;
  const mapping = value as Partial<UserBarcodeMapping>;
  return (
    typeof mapping.barcode === "string" &&
    typeof mapping.flavourName === "string" &&
    typeof mapping.sizeMl === "number" &&
    typeof mapping.pricePerCan === "number" &&
    typeof mapping.createdAt === "string" &&
    typeof mapping.updatedAt === "string" &&
    (mapping.sugarFree === undefined || typeof mapping.sugarFree === "boolean") &&
    (mapping.caffeineMgPerCan === undefined || typeof mapping.caffeineMgPerCan === "number")
  );
}
