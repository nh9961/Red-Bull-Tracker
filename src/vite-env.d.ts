/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPWRITE_ENDPOINT?: string;
  readonly VITE_APPWRITE_PROJECT_ID?: string;
  readonly VITE_APPWRITE_DATABASE_ID?: string;
  readonly VITE_APPWRITE_COLLECTION_ID?: string;
  readonly VITE_APPWRITE_OAUTH_SUCCESS_URL?: string;
  readonly VITE_APPWRITE_OAUTH_FAILURE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
