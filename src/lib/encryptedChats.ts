import type { Models } from "appwrite";
import type { CoachChat } from "../types";
import { appwriteConfig, ID, Permission, Query, Role, tablesDB } from "./appwrite";

const CHAT_CRYPTO_VERSION = 1;
const KEY_ITERATIONS = 210_000;

type EncryptedChatRow = Models.Row & {
  userId: string;
  encryptedTitle: string;
  encryptedMessages: string;
  titleIv: string;
  messagesIv: string;
  salt: string;
  version: number;
  updatedAt: string;
};

type EncryptedValue = {
  ciphertext: string;
  iv: string;
};

export async function listEncryptedChats(userId: string, passphrase: string) {
  const response = await tablesDB.listRows<EncryptedChatRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.chatCollectionId,
    queries: [Query.equal("userId", userId), Query.orderDesc("updatedAt"), Query.limit(50)],
  });

  const chats: CoachChat[] = [];
  for (const row of response.rows) {
    chats.push(await decryptChatRow(row, passphrase));
  }

  return chats;
}

export async function createEncryptedChat(userId: string, passphrase: string, chat: CoachChat) {
  const row = await tablesDB.createRow<EncryptedChatRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.chatCollectionId,
    rowId: ID.custom(chat.id),
    data: await toEncryptedRowData(userId, passphrase, chat),
    permissions: userRowPermissions(userId),
  });

  return decryptChatRow(row, passphrase);
}

export async function updateEncryptedChat(userId: string, passphrase: string, chat: CoachChat) {
  const row = await tablesDB.updateRow<EncryptedChatRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.chatCollectionId,
    rowId: chat.id,
    data: await toEncryptedRowData(userId, passphrase, chat),
    permissions: userRowPermissions(userId),
  });

  return decryptChatRow(row, passphrase);
}

export async function deleteEncryptedChat(id: string) {
  await tablesDB.deleteRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.chatCollectionId,
    rowId: id,
  });
}

export function chatStorageErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/decrypt|operation failed|unable to decrypt/i.test(error.message)) {
      return "Encrypted chat key could not unlock saved chats.";
    }
    if (/not found|404/i.test(error.message)) {
      return `Appwrite chat table '${appwriteConfig.chatCollectionId}' was not found.`;
    }
    if (/permissions?.*create|action 'create'|not authorized|401|unauthorized/i.test(error.message)) {
      return `Appwrite chat table needs Users -> Create and row security on '${appwriteConfig.chatCollectionId}'.`;
    }
    return error.message;
  }
  return "Encrypted chat storage failed.";
}

async function toEncryptedRowData(userId: string, passphrase: string, chat: CoachChat) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, userId, salt);
  const title = await encryptText(chat.title, key);
  const messages = await encryptText(JSON.stringify(chat.messages), key);

  return {
    userId,
    encryptedTitle: title.ciphertext,
    encryptedMessages: messages.ciphertext,
    titleIv: title.iv,
    messagesIv: messages.iv,
    salt: bytesToBase64(salt),
    version: CHAT_CRYPTO_VERSION,
    updatedAt: chat.updatedAt,
  };
}

async function decryptChatRow(row: EncryptedChatRow, passphrase: string): Promise<CoachChat> {
  const salt = base64ToBytes(row.salt);
  const key = await deriveKey(passphrase, row.userId, salt);
  const title = await decryptText({ ciphertext: row.encryptedTitle, iv: row.titleIv }, key);
  const messages = JSON.parse(await decryptText({ ciphertext: row.encryptedMessages, iv: row.messagesIv }, key));

  return {
    id: row.$id,
    userId: row.userId,
    title,
    messages,
    createdAt: row.$createdAt,
    updatedAt: row.updatedAt || row.$updatedAt,
  };
}

async function deriveKey(passphrase: string, userId: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${userId}:${passphrase}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bytesToArrayBuffer(salt), iterations: KEY_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function encryptText(value: string, key: CryptoKey): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

async function decryptText(value: EncryptedValue, key: CryptoKey) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(value.iv) },
    key,
    base64ToBytes(value.ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function userRowPermissions(userId: string) {
  const role = Role.user(userId);
  return [Permission.read(role), Permission.update(role), Permission.delete(role)];
}
