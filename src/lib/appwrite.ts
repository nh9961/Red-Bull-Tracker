import { Account, Channel, Client, ID, Permission, Query, Role, TablesDB } from "appwrite";

const env = import.meta.env;

export const appwriteConfig = {
  endpoint: env.VITE_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1",
  projectId: env.VITE_APPWRITE_PROJECT_ID!,
  databaseId: env.VITE_APPWRITE_DATABASE_ID || "redbull_tracker",
  collectionId: env.VITE_APPWRITE_COLLECTION_ID || "intake_entries",
  chatCollectionId: env.VITE_APPWRITE_CHAT_COLLECTION_ID || "coach_chats",
  barcodeCollectionId: env.VITE_APPWRITE_BARCODE_COLLECTION_ID || "barcode_products",
};

const client = new Client()
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId);

const account = new Account(client);
const tablesDB = new TablesDB(client);

export async function pingAppwrite() {
  return client.ping();
}

export { account, Channel, client, ID, Permission, Query, Role, tablesDB };
