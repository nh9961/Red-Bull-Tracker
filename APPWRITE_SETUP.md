# Red Bull Intake Tracker Setup

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

The Vite dev app runs at `http://localhost:5173` unless that port is already taken.

## Environment

Copy `.env.example` to `.env.local` and adjust IDs if you choose different Appwrite resource IDs:

```bash
cp .env.example .env.local
```

This app uses only the Appwrite browser SDK. Do not add an API key to the frontend.

To create/update the database tables from this repo, set a server/admin key as `APPWRITE_API_KEY` in `.env.local` and run:

```bash
npm run setup:appwrite
```

The setup script reads `APPWRITE_API_KEY` only from Node, never from browser code.

Configured defaults:

- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Project ID: `6a0752ee001fb2ef7138`
- Project name: `Red Bull Tracker App`
- Database ID: `redbull_tracker`
- Collection ID: `intake_entries`
- Chat collection ID: `coach_chats`

`client.ping()` is called automatically during app boot in `src/App.tsx` through `pingAppwrite()` from `src/lib/appwrite.ts`.

## Auth

Enable these auth methods in Appwrite Console:

- Email/password
- GitHub OAuth
- Google OAuth

Add a Web platform in Appwrite Console for local development:

- Hostname: `localhost`
- Hostname: `127.0.0.1`

If `client.ping()` shows `Failed to fetch`, this is usually the first thing to check.

For local OAuth callback URLs, add:

- Success URL: `http://localhost:5173`
- Failure URL: `http://localhost:5173`
- If Vite starts on another port, add that origin too, for example `http://127.0.0.1:5174`

For production, add your deployed origin as both success and failure URL, then update the `VITE_APPWRITE_OAUTH_*` variables.

In local dev, you can leave `VITE_APPWRITE_OAUTH_SUCCESS_URL` and `VITE_APPWRITE_OAUTH_FAILURE_URL` blank. The app will use the current browser origin automatically, which avoids getting redirected to a stale Vite port.

If OAuth returns to the app but you are still logged out:

- Confirm the current browser origin is listed under Appwrite project platforms, for example `localhost` and `127.0.0.1`.
- Confirm the same origin is allowed in the OAuth provider success/failure URLs.
- Clear old sessions/cookies for the local app and try again.
- Restart Vite after editing `.env.local`.

## Database

Appwrite currently uses newer Console wording in many places:

| In this app / older SDK wording | Current Appwrite Console wording |
| --- | --- |
| Collection | Table |
| Attribute | Column |
| Document | Row |

So if the Console asks you to create a **table**, that is the same resource as the `VITE_APPWRITE_COLLECTION_ID` this app currently points at. If the setup below says **attributes**, add them as **columns** inside that table.

The app uses Appwrite's current `TablesDB` SDK methods (`listRows`, `createRow`, `updateRow`, `deleteRow`). The env var remains named `VITE_APPWRITE_COLLECTION_ID` for compatibility with the first setup pass, but its value should be your table ID.

Create a database with ID:

```text
redbull_tracker
```

Create a collection with ID:

```text
intake_entries
```

Enable document-level permissions on the collection.

Recommended collection-level permissions:

- Create: `users`
- Read: none
- Update: none
- Delete: none

The app writes per-document permissions for the current user:

- `read("user:{userId}")`
- `update("user:{userId}")`
- `delete("user:{userId}")`

## Permission Troubleshooting

If the app shows:

```text
No permissions provided for action 'create'
```

the table is reachable, but the signed-in user is not allowed to create rows yet.

Fix it in Appwrite Console:

1. Open **Databases**.
2. Open database `redbull_tracker`.
3. Open table `intake_entries`.
4. Go to **Settings**.
5. Enable **Row Security**.
6. Under **Permissions**, add role **Users**.
7. Check **Create** only.
8. Leave table-level **Read**, **Update**, and **Delete** unchecked.
9. Click **Update** / **Save**.

Why: table-level **Create** lets authenticated users add their own rows. The app then writes row-level read/update/delete permissions for that exact user, so users do not see each other's entries.

## Attributes

Create these attributes:

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `userId` | String, 64 | Yes | Current Appwrite user ID |
| `cans` | Float | Yes | Allows partial cans |
| `flavour` | String, 128 | Yes | Red Bull flavour |
| `flavourAccent` | String, 32 | Yes | UI colour |
| `sizeMl` | Integer | Yes | Can size in ml |
| `pricePerCan` | Float | Yes | GBP price per can |
| `dateTime` | DateTime | Yes | Intake timestamp |
| `notes` | String, 2000 | No | Optional notes |
| `store` | String, 256 | No | Store/location |
| `sugarFree` | Boolean | Yes | Sugar-free flag |
| `caffeineMgPerCan` | Float | No | Custom-size override |
| `importKey` | String, 512 | Yes | Duplicate detection signature |
| `source` | String, 32 | Yes | `manual`, `quick-add`, `excel`, or `json` |

Recommended indexes:

- `user_date_desc`: key index on `userId`, `dateTime`
- `user_import_key`: key index on `userId`, `importKey`
- Optional unique index on `userId`, `importKey` if your Appwrite plan/schema supports it

## Encrypted Coach Chats

Create a second table with ID:

```text
coach_chats
```

Enable row security on `coach_chats`.

Recommended table-level permissions:

- Create: `users`
- Read: none
- Update: none
- Delete: none

The app stores coach chat titles and messages as plain JSON in Appwrite with row-level user permissions.

Create these chat columns:

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `userId` | String, 64 | Yes | Current Appwrite user ID |
| `title` | String, 512 | Yes | Chat title |
| `messages` | Longtext | Yes | JSON array of coach messages |
| `updatedAt` | DateTime | Yes | Sort key |

Recommended chat index:

- `user_chat_updated`: key index on `userId`, `updatedAt`

## Component Structure

- `src/App.tsx`: UI shell, auth gate, dashboard/logbook/trends/coach/data views, modals, and action state.
- `src/lib/appwrite.ts`: Appwrite SDK client, account/database services, env config, and ping helper.
- `src/lib/appwriteEntries.ts`: User-scoped Appwrite CRUD, document permissions, duplicate signatures.
- `src/lib/coachChats.ts`: Appwrite-backed coach chat storage.
- `src/lib/excel.ts`: Styled `.xlsx` export, summary sheet, row validation, duplicate-aware import preview.
- `src/lib/metrics.ts`: Prices, caffeine/sugar estimates, stats, grouping, streaks.
- `src/lib/storage.ts`: JSON backup export/import parser.
- `src/data/flavours.ts`: Built-in flavours and accent metadata.

## Nutrition Defaults

- 250ml: `£1.75`, `80mg` caffeine
- 355ml: `£2.20`, `114mg` caffeine
- 473ml: `£2.85`, `151mg` caffeine
- Custom sizes: caffeine is proportional from 250ml unless a custom override is entered

The UI shows this disclaimer:

> Caffeine and sugar values are estimates. Check the can label for exact nutritional information.
