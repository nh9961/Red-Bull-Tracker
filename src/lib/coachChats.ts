import type { Models } from "appwrite";
import type { CoachChat, CoachMessage } from "../types";
import { appwriteConfig, ID, Permission, Query, Role, tablesDB } from "./appwrite";

type CoachChatRow = Models.Row & {
  userId: string;
  title: string;
  messages: string;
  updatedAt: string;
};

export async function listCoachChats(userId: string) {
  const response = await tablesDB.listRows<CoachChatRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.chatCollectionId,
    queries: [Query.equal("userId", userId), Query.orderDesc("updatedAt"), Query.limit(50)],
  });

  return response.rows.filter(isPlainChatRow).map(fromRow);
}

export async function createCoachChat(userId: string, chat: CoachChat) {
  const row = await tablesDB.createRow<CoachChatRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.chatCollectionId,
    rowId: ID.custom(chat.id),
    data: toRowData(userId, chat),
    permissions: userRowPermissions(userId),
  });

  return fromRow(row);
}

export async function updateCoachChat(userId: string, chat: CoachChat) {
  const row = await tablesDB.updateRow<CoachChatRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.chatCollectionId,
    rowId: chat.id,
    data: toRowData(userId, chat),
    permissions: userRowPermissions(userId),
  });

  return fromRow(row);
}

export async function deleteCoachChat(id: string) {
  await tablesDB.deleteRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.chatCollectionId,
    rowId: id,
  });
}

export function chatStorageErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/not found|404/i.test(error.message)) {
      return `Appwrite chat table '${appwriteConfig.chatCollectionId}' was not found. Run npm run setup:appwrite.`;
    }
    if (/permissions?.*create|action 'create'|not authorized|401|unauthorized/i.test(error.message)) {
      return `Appwrite chat table needs Users -> Create and row security on '${appwriteConfig.chatCollectionId}'.`;
    }
    if (/unknown attribute|invalid document structure|missing required attribute/i.test(error.message)) {
      if (/encrypted/i.test(error.message)) {
        return "Coach chat table still requires legacy encrypted columns. Run npm run setup:appwrite or remove encryptedTitle, encryptedMessages, titleIv, messagesIv, salt, and version as required in Appwrite Console.";
      }
      return "Coach chat schema needs title and messages columns. Run npm run setup:appwrite.";
    }
    return error.message;
  }
  return "Coach chat storage failed.";
}

function toRowData(userId: string, chat: CoachChat) {
  return {
    userId,
    title: chat.title.slice(0, 512) || "today",
    messages: JSON.stringify(chat.messages),
    updatedAt: chat.updatedAt,
  };
}

function isPlainChatRow(row: CoachChatRow) {
  return typeof row.title === "string" && row.title.length > 0 && typeof row.messages === "string" && row.messages.length > 0;
}

function fromRow(row: CoachChatRow): CoachChat {
  let messages: CoachMessage[] = [];
  try {
    messages = JSON.parse(row.messages) as CoachMessage[];
  } catch {
    messages = [];
  }

  return {
    id: row.$id,
    userId: row.userId,
    title: row.title,
    messages,
    createdAt: row.$createdAt,
    updatedAt: row.updatedAt || row.$updatedAt,
  };
}

function userRowPermissions(userId: string) {
  const role = Role.user(userId);
  return [Permission.read(role), Permission.update(role), Permission.delete(role)];
}
