/* global console, fetch, process, setTimeout */

import { existsSync, readFileSync } from "node:fs";
import { URL } from "node:url";

const env = loadEnvFiles([".env", ".env.local"]);

const endpoint = readEnv("VITE_APPWRITE_ENDPOINT", "https://fra.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = readEnv("VITE_APPWRITE_PROJECT_ID", "6a0752ee001fb2ef7138");
const databaseId = readEnv("VITE_APPWRITE_DATABASE_ID", "redbull_tracker");
const intakeTableId = readEnv("VITE_APPWRITE_COLLECTION_ID", "intake_entries");
const chatTableId = readEnv("VITE_APPWRITE_CHAT_COLLECTION_ID", "coach_chats");
const barcodeTableId = readEnv("VITE_APPWRITE_BARCODE_COLLECTION_ID", "barcode_products");
const apiKey = readEnv("APPWRITE_API_KEY", "");
const verifiedBarcodeProducts = JSON.parse(
  readFileSync(new URL("../src/data/verified-barcodes.json", import.meta.url), "utf8"),
);

if (!apiKey) {
  throw new Error("APPWRITE_API_KEY missing. Add a server/admin Appwrite key to .env.local, without VITE_.");
}

await ensureDatabase(databaseId, "Red Bull Tracker");
await ensureTable({
  tableId: intakeTableId,
  name: "Intake entries",
  columns: [
    { kind: "string", key: "userId", size: 64, required: true },
    { kind: "float", key: "cans", required: true },
    { kind: "string", key: "flavour", size: 128, required: true },
    { kind: "string", key: "flavourAccent", size: 32, required: true },
    { kind: "integer", key: "sizeMl", required: true },
    { kind: "float", key: "pricePerCan", required: true },
    { kind: "datetime", key: "dateTime", required: true },
    { kind: "string", key: "notes", size: 2000, required: false },
    { kind: "string", key: "store", size: 256, required: false },
    { kind: "boolean", key: "sugarFree", required: true },
    { kind: "float", key: "caffeineMgPerCan", required: false },
    { kind: "string", key: "importKey", size: 512, required: true },
    { kind: "string", key: "source", size: 32, required: true },
  ],
  indexes: [
    { key: "user_date_desc", type: "key", columns: ["userId", "dateTime"], orders: ["ASC", "DESC"], lengths: [32] },
    { key: "user_import_key", type: "key", columns: ["userId", "importKey"], orders: ["ASC", "ASC"], lengths: [32, 128] },
  ],
});
await ensureTable({
  tableId: chatTableId,
  name: "Coach chats",
  columns: [
    { kind: "string", key: "userId", size: 64, required: true },
    { kind: "string", key: "title", size: 512, required: true },
    { kind: "longtext", key: "messages", required: true },
    { kind: "datetime", key: "updatedAt", required: true },
  ],
  indexes: [{ key: "user_chat_updated", type: "key", columns: ["userId", "updatedAt"], orders: ["ASC", "DESC"], lengths: [32] }],
});
await retireLegacyChatColumns(chatTableId, [
  "encryptedTitle",
  "encryptedMessages",
  "titleIv",
  "messagesIv",
  "salt",
  "version",
]);
await waitForColumns(chatTableId, ["userId", "title", "messages", "updatedAt"]);
await ensureTable({
  tableId: barcodeTableId,
  name: "Barcode products",
  // Schema notes:
  // - scope="verified" rows are seeded by this admin script and readable by signed-in users.
  // - scope="user" rows are created by the browser SDK with per-user row permissions.
  columns: [
    { kind: "string", key: "scope", size: 16, required: true },
    { kind: "string", key: "ownerUserId", size: 64, required: false },
    { kind: "string", key: "barcode", size: 32, required: true },
    { kind: "string", key: "flavourName", size: 128, required: true },
    { kind: "integer", key: "sizeMl", required: true },
    { kind: "float", key: "pricePerCan", required: true },
    { kind: "boolean", key: "sugarFree", required: true },
    { kind: "float", key: "caffeineMgPerCan", required: false },
    { kind: "string", key: "verifiedBy", size: 512, required: false },
    { kind: "string", key: "sourceName", size: 512, required: false },
    { kind: "string", key: "sourceUrl", size: 2048, required: false },
    { kind: "string", key: "variant", size: 64, required: false },
    { kind: "string", key: "notes", size: 2000, required: false },
  ],
  indexes: [
    { key: "barcode", type: "key", columns: ["barcode"], orders: ["ASC"], lengths: [32] },
    { key: "scope_barcode", type: "key", columns: ["scope", "barcode"], orders: ["ASC", "ASC"], lengths: [16, 32] },
    { key: "user_barcode", type: "key", columns: ["ownerUserId", "barcode"], orders: ["ASC", "ASC"], lengths: [64, 32] },
  ],
});
await seedVerifiedBarcodeProducts(barcodeTableId, verifiedBarcodeProducts);

console.log("Appwrite database and tables ready.");

async function ensureDatabase(id, name) {
  const existing = await request("GET", `/tablesdb/${id}`, undefined, [200, 404]);
  if (existing.status === 200) {
    console.log(`Database ${id} exists.`);
    return;
  }

  await request("POST", "/tablesdb", { databaseId: id, name, enabled: true }, [201]);
  console.log(`Database ${id} created.`);
}

async function ensureTable({ tableId, name, columns, indexes }) {
  const existing = await request("GET", `/tablesdb/${databaseId}/tables/${tableId}`, undefined, [200, 404]);
  if (existing.status === 404) {
    await request(
      "POST",
      `/tablesdb/${databaseId}/tables`,
      {
        tableId,
        name,
        permissions: ['create("users")'],
        rowSecurity: true,
        enabled: true,
      },
      [201],
    );
    console.log(`Table ${tableId} created.`);
  } else {
    await request(
      "PUT",
      `/tablesdb/${databaseId}/tables/${tableId}`,
      { name, permissions: ['create("users")'], rowSecurity: true, enabled: true, purge: true },
      [200],
    );
    console.log(`Table ${tableId} exists and permissions updated.`);
  }

  for (const column of columns) {
    await ensureColumn(tableId, column);
  }
  await waitForColumns(tableId, columns.map((column) => column.key));
  for (const index of indexes) {
    await ensureIndex(tableId, index);
  }
}

async function ensureColumn(tableId, column) {
  const existing = await request("GET", `/tablesdb/${databaseId}/tables/${tableId}/columns/${column.key}`, undefined, [200, 404]);
  if (existing.status === 200) {
    console.log(`Column ${tableId}.${column.key} exists.`);
    return;
  }

  const body = {
    key: column.key,
    required: column.required,
    array: false,
  };
  if (column.size) body.size = column.size;
  if (column.encrypt) body.encrypt = true;

  await request("POST", `/tablesdb/${databaseId}/tables/${tableId}/columns/${column.kind}`, body, [202, 201]);
  console.log(`Column ${tableId}.${column.key} created.`);
}

async function retireLegacyChatColumns(tableId, keys) {
  for (const key of keys) {
    const existing = await request("GET", `/tablesdb/${databaseId}/tables/${tableId}/columns/${key}`, undefined, [200, 404]);
    if (existing.status === 404) {
      console.log(`Legacy column ${tableId}.${key} already removed.`);
      continue;
    }

    await request("DELETE", `/tablesdb/${databaseId}/tables/${tableId}/columns/${key}`, undefined, [204, 404]);
    console.log(`Legacy column ${tableId}.${key} removed.`);
  }
}

async function ensureIndex(tableId, index) {
  const existing = await request("GET", `/tablesdb/${databaseId}/tables/${tableId}/indexes/${index.key}`, undefined, [200, 404]);
  if (existing.status === 200) {
    console.log(`Index ${tableId}.${index.key} exists.`);
    return;
  }

  await request(
    "POST",
    `/tablesdb/${databaseId}/tables/${tableId}/indexes`,
    { key: index.key, type: index.type, columns: index.columns, orders: index.orders, lengths: index.lengths },
    [202, 201],
  );
  console.log(`Index ${tableId}.${index.key} created.`);
}

async function seedVerifiedBarcodeProducts(tableId, products) {
  for (const [barcode, product] of Object.entries(products)) {
    const rowId = `verified_${barcode}`;
    const data = {
      scope: "verified",
      ownerUserId: "",
      barcode,
      flavourName: product.flavourName,
      sizeMl: product.sizeMl,
      pricePerCan: product.pricePerCan,
      sugarFree: Boolean(product.sugarFree),
      caffeineMgPerCan: product.caffeineMgPerCan,
      verifiedBy: product.verifiedBy ?? "",
      sourceName: product.sourceName ?? "",
      sourceUrl: product.sourceUrl ?? "",
      variant: product.variant ?? "",
      notes: product.notes ?? "",
    };
    const path = `/tablesdb/${databaseId}/tables/${tableId}/rows/${rowId}`;
    const existing = await request("GET", path, undefined, [200, 404]);

    if (existing.status === 404) {
      await request(
        "POST",
        `/tablesdb/${databaseId}/tables/${tableId}/rows`,
        { rowId, data, permissions: ['read("users")'] },
        [201],
      );
      console.log(`Verified barcode ${barcode} seeded.`);
      continue;
    }

    await request("PUT", path, { data, permissions: ['read("users")'] }, [200]);
    console.log(`Verified barcode ${barcode} updated.`);
  }
}

async function waitForColumns(tableId, keys) {
  const pending = new Set(keys);
  for (let attempt = 0; attempt < 30 && pending.size; attempt += 1) {
    for (const key of [...pending]) {
      const response = await request("GET", `/tablesdb/${databaseId}/tables/${tableId}/columns/${key}`, undefined, [200, 404]);
      if (response.status === 200 && ["available", "failed"].includes(response.body.status)) {
        if (response.body.status === "failed") throw new Error(`Column ${tableId}.${key} failed: ${response.body.error || "unknown error"}`);
        pending.delete(key);
      }
    }
    if (pending.size) await delay(1_000);
  }
  if (pending.size) throw new Error(`Timed out waiting for columns: ${[...pending].join(", ")}`);
}

async function request(method, path, body, okStatuses) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Key": apiKey,
      "X-Appwrite-Project": projectId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? parseJson(text) : null;
  if (!okStatuses.includes(response.status)) {
    const message = parsed?.message || text || `${method} ${path} failed with status ${response.status}`;
    throw new Error(message);
  }

  return { status: response.status, body: parsed };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readEnv(name, fallback) {
  return process.env[name] || env[name] || fallback;
}

function loadEnvFiles(paths) {
  const values = {};
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      values[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return values;
}
