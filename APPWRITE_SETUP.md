# Red Bull tracker setup

This app uses Appwrite for auth and intake entries.

## env

Copy `.env.example` to `.env.local`, then fill in:

```sh
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_project_id
VITE_APPWRITE_DATABASE_ID=redbull_tracker
VITE_APPWRITE_COLLECTION_ID=intake_entries
APPWRITE_API_KEY=server_key_for_setup_only
```

Leave the OAuth URLs empty in local dev unless you need fixed callback URLs.

## setup

Run:

```sh
npm run setup:appwrite
```

The script creates or updates:

- database: `redbull_tracker`
- table: `intake_entries`
- table permission: `Users -> Create`
- row security: enabled

Rows use per-user read, update, and delete permissions.

## intake columns

| key | type | required |
| --- | --- | --- |
| `userId` | String, 64 | Yes |
| `cans` | Float | Yes |
| `flavour` | String, 128 | Yes |
| `flavourAccent` | String, 32 | Yes |
| `sizeMl` | Integer | Yes |
| `pricePerCan` | Float | Yes |
| `dateTime` | DateTime | Yes |
| `notes` | String, 2000 | No |
| `store` | String, 256 | No |
| `sugarFree` | Boolean | Yes |
| `caffeineMgPerCan` | Float | No |
| `importKey` | String, 512 | Yes |
| `source` | String, 32 | Yes |

## indexes

- `user_date_desc`: `userId`, `dateTime`
- `user_import_key`: `userId`, `importKey`

## run

```sh
npm install
npm run dev
```

## deployment-only files

The repo ignores `.deploy/` and local public HTML pages.

For your own deployment, create:

- `.deploy/head.html` for analytics or other head-only snippets
- `.deploy/body-end.html` for footer links or deploy-only markup
- any local public HTML pages your host needs

Vite injects the optional `.deploy` snippets into `index.html` at build time.
