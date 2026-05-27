import { Account, Channel, Client, ID, OAuthProvider, Permission, Query, Role, TablesDB } from "appwrite";

const env = import.meta.env;
const currentOrigin = window.location.origin;

export const appwriteConfig = {
  endpoint: env.VITE_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1",
  projectId: env.VITE_APPWRITE_PROJECT_ID || "6a0752ee001fb2ef7138",
  databaseId: env.VITE_APPWRITE_DATABASE_ID || "redbull_tracker",
  collectionId: env.VITE_APPWRITE_COLLECTION_ID || "intake_entries",
  barcodeCollectionId: env.VITE_APPWRITE_BARCODE_COLLECTION_ID || "barcode_products",
  oauthSuccessUrl: resolveOAuthUrl(env.VITE_APPWRITE_OAUTH_SUCCESS_URL),
  oauthFailureUrl: resolveOAuthUrl(env.VITE_APPWRITE_OAUTH_FAILURE_URL),
};

const client = new Client()
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId);

const account = new Account(client);
const tablesDB = new TablesDB(client);

export async function pingAppwrite() {
  return client.ping();
}

export { account, Channel, client, ID, OAuthProvider, Permission, Query, Role, tablesDB };

function resolveOAuthUrl(value?: string) {
  if (!value) return currentOrigin;

  const configured = new URL(value, currentOrigin);
  const current = new URL(currentOrigin);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (env.DEV && localHosts.has(configured.hostname) && localHosts.has(current.hostname)) {
    return currentOrigin;
  }

  return configured.toString().replace(/\/$/, "");
}
