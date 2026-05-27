import type { Models } from "appwrite";
import type { BarcodeLookupCatalog, BarcodeProductDraft, BarcodeSeedProduct, UserBarcodeMapping } from "../types";
import { appwriteConfig, ID, Permission, Query, Role, tablesDB } from "./appwrite";
import { normalizeBarcode } from "./barcodeLookup";

type BarcodeRowScope = "verified" | "user";

type BarcodeRow = Models.Row & {
  scope: BarcodeRowScope;
  ownerUserId?: string;
  barcode: string;
  flavourName: string;
  sizeMl: number;
  pricePerCan: number;
  sugarFree: boolean;
  caffeineMgPerCan?: number;
  verifiedBy?: string;
  sourceName?: string;
  sourceUrl?: string;
  variant?: string;
  notes?: string;
};

export async function listBarcodeCatalog(): Promise<BarcodeLookupCatalog> {
  const verifiedProducts: Record<string, BarcodeSeedProduct> = {};
  const userMappings: UserBarcodeMapping[] = [];
  const limit = 200;
  let offset = 0;

  while (true) {
    const response = await tablesDB.listRows<BarcodeRow>({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.barcodeCollectionId,
      queries: [Query.orderAsc("barcode"), Query.limit(limit), Query.offset(offset)],
    });

    response.rows.forEach((row) => {
      if (row.scope === "verified") {
        verifiedProducts[row.barcode] = fromVerifiedRow(row);
        return;
      }
      userMappings.push(fromUserRow(row));
    });

    if (response.rows.length < limit) break;
    offset += limit;
  }

  return { verifiedProducts, userMappings };
}

export async function upsertCloudUserBarcodeMapping(
  userId: string,
  barcodeValue: string,
  product: BarcodeProductDraft,
) {
  const barcode = normalizeBarcode(barcodeValue);
  const existing = await findUserBarcodeRow(userId, barcode);
  const data = toUserRowData(userId, barcode, product);

  if (existing) {
    const row = await tablesDB.updateRow<BarcodeRow>({
      databaseId: appwriteConfig.databaseId,
      tableId: appwriteConfig.barcodeCollectionId,
      rowId: existing.$id,
      data,
      permissions: userRowPermissions(userId),
    });
    return fromUserRow(row);
  }

  const row = await tablesDB.createRow<BarcodeRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.barcodeCollectionId,
    rowId: ID.unique(),
    data,
    permissions: userRowPermissions(userId),
  });
  return fromUserRow(row);
}

async function findUserBarcodeRow(userId: string, barcode: string) {
  const response = await tablesDB.listRows<BarcodeRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.barcodeCollectionId,
    queries: [
      Query.equal("scope", "user"),
      Query.equal("ownerUserId", userId),
      Query.equal("barcode", barcode),
      Query.limit(1),
    ],
  });

  return response.rows[0] ?? null;
}

function fromVerifiedRow(row: BarcodeRow): BarcodeSeedProduct {
  return {
    flavourName: row.flavourName,
    sizeMl: row.sizeMl,
    pricePerCan: row.pricePerCan,
    sugarFree: row.sugarFree,
    caffeineMgPerCan: row.caffeineMgPerCan,
    verifiedBy: row.verifiedBy || "Verified source",
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    variant: row.variant,
    notes: row.notes,
  };
}

function fromUserRow(row: BarcodeRow): UserBarcodeMapping {
  return {
    barcode: row.barcode,
    flavourName: row.flavourName,
    sizeMl: row.sizeMl,
    pricePerCan: row.pricePerCan,
    sugarFree: row.sugarFree,
    caffeineMgPerCan: row.caffeineMgPerCan,
    createdAt: row.$createdAt,
    updatedAt: row.$updatedAt,
  };
}

function toUserRowData(userId: string, barcode: string, product: BarcodeProductDraft) {
  return {
    scope: "user" as const,
    ownerUserId: userId,
    barcode,
    flavourName: product.flavourName,
    sizeMl: product.sizeMl,
    pricePerCan: product.pricePerCan,
    sugarFree: Boolean(product.sugarFree),
    caffeineMgPerCan: product.caffeineMgPerCan,
    verifiedBy: "User saved mapping",
    sourceName: "",
    sourceUrl: "",
    variant: "user",
    notes: "",
  };
}

function userRowPermissions(userId: string) {
  const role = Role.user(userId);
  return [Permission.read(role), Permission.update(role), Permission.delete(role)];
}
