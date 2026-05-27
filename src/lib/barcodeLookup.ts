import { BUILT_IN_BARCODE_PRODUCTS } from "../data/barcodes";
import { BUILT_IN_FLAVOURS, flavourMeta } from "../data/flavours";
import { caffeinePerCan } from "./metrics";
import type {
  BarcodeLookupCatalog,
  BarcodeLookupResult,
  BarcodeProductDraft,
  ResolvedBarcodeProduct,
  UserBarcodeMapping,
  EntryDraft,
} from "../types";

const knownFlavourNames = new Set(BUILT_IN_FLAVOURS.map((flavour) => flavour.name));

export function normalizeBarcode(value: string) {
  return value.replace(/\D/g, "");
}

export function lookupBarcode(
  rawBarcode: string,
  catalogOrUserMappings: BarcodeLookupCatalog | UserBarcodeMapping[] = [],
): BarcodeLookupResult {
  const catalog = Array.isArray(catalogOrUserMappings)
    ? { userMappings: catalogOrUserMappings }
    : catalogOrUserMappings;
  const userMappings = catalog.userMappings ?? [];
  const verifiedProducts = catalog.verifiedProducts ?? BUILT_IN_BARCODE_PRODUCTS;
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) {
    return { status: "unknown", barcode: rawBarcode.trim() };
  }

  const userMapping = userMappings.find((mapping) => mapping.barcode === barcode);
  if (userMapping) {
    return { status: "user", barcode, product: resolveProduct(userMapping, "user") };
  }

  const seedProduct = verifiedProducts[barcode];
  if (!seedProduct) {
    return { status: "unknown", barcode };
  }

  if (!knownFlavourNames.has(seedProduct.flavourName)) {
    return {
      status: "partial",
      barcode,
      product: seedProduct,
      reason: "This barcode has product data, but its flavour is not in the built-in Red Bull list yet.",
    };
  }

  return { status: "known", barcode, product: resolveProduct(seedProduct, "built-in") };
}

export function resolveProduct(
  product: BarcodeProductDraft,
  source: ResolvedBarcodeProduct["source"],
): ResolvedBarcodeProduct {
  const meta = flavourMeta(product.flavourName);
  return {
    ...product,
    flavourAccent: meta.accent,
    sugarFree: product.sugarFree ?? Boolean(meta.sugarFree),
    caffeineMgPerCan: product.caffeineMgPerCan,
    source,
  };
}

export function barcodeProductToEntryDraft(
  product: ResolvedBarcodeProduct,
  barcode: string,
): EntryDraft {
  return {
    cans: 1,
    flavour: product.flavourName,
    flavourAccent: product.flavourAccent,
    sizeMl: product.sizeMl,
    pricePerCan: product.pricePerCan,
    dateTime: new Date().toISOString(),
    notes: `Barcode scan: ${barcode}`,
    store: "",
    sugarFree: Boolean(product.sugarFree),
    caffeineMgPerCan: product.caffeineMgPerCan,
    source: "manual",
  };
}

export function productCaffeineMg(product: BarcodeProductDraft) {
  return caffeinePerCan(product.sizeMl, product.caffeineMgPerCan);
}
