# Hangar

Database for aircraft model collections (1:200, 1:400, 1:500 and others). Next.js, TypeScript, Tailwind, Drizzle, PostgreSQL.

## Start

```bash
npm install --legacy-peer-deps
npm run dev            # http://localhost:3000, register an account
```

No database setup is needed locally. Without `DATABASE_URL` the app runs on PGlite, a real PostgreSQL compiled to WASM, stored in `.data/pg`. Migrations and reference data run at startup.

Sample data for development only (invented item numbers and prices):

```bash
npm run db:seed-dev            # demo@hangar.test / hangar-demo-1
npm run db:seed-dev -- 2000    # stress test
```

PGlite allows one process at a time, so stop the dev server before running seed or catalog scripts.

## Online (PC + phone)

Step-by-step guide (German) for Neon + Cloudflare R2 + Vercel, moving the local collection over and installing the app on a phone: [DEPLOY.md](DEPLOY.md). Hangar is a PWA: installable, opens offline with the last loaded state, and scans box barcodes (EAN) for duplicate checks.

## Desktop app (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build-launcher.ps1   # creates Hangar.exe on the desktop
```

Hangar.exe rebuilds the app when anything in `src`, `public`, `drizzle`, the package files or `.env*` changed since the last build, runs it on port 3210 and opens it in its own Edge/Chrome app window. Closing the window stops the server. If a build fails, it offers to start the last working version. Log: `%LOCALAPPDATA%\Hangar\launcher.log`. Rebuild the exe only when `desktop/HangarLauncher.cs` or the project folder changes. Stop `npm run dev` first, since both use the same PGlite database.

## Configuration

Everything is optional locally. See `.env.example`.

| Variable | Without it | With it |
|---|---|---|
| `DATABASE_URL` | PGlite in `.data/pg` | Hosted PostgreSQL. **Required in production** (Neon, Supabase, …) |
| `BETTER_AUTH_SECRET` | Generated once in `.data/auth-secret` | **Required with `DATABASE_URL` in production** |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Public URL of the deployment |
| `HANGAR_AUTH` | off | `on` enables accounts and login. Off means one local user with no login: never deploy publicly like that |
| `HANGAR_SIGNUP` | open | `off` closes registration, only existing accounts can sign in |
| `CRON_SECRET` | Market prices refresh on a timer in the server process | Serverless: refresh via `GET /api/cron/market` with `Authorization: Bearer …` |
| `SMTP_URL`, `MAIL_FROM` | Password reset links are printed in the server log | Real email |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Images in `.data/uploads` | Any S3-compatible bucket (R2, B2, …) |
| `ADMIN_EMAILS` | No moderators | Comma-separated accounts that can verify and reject catalog entries |

Exchange rates come from frankfurter.dev (ECB, no key). If unreachable, the last stored rates are used; without any rates, foreign amounts stay out of the totals and the dashboard says so.

## Tests

```bash
npm test                             # logic, translations, user isolation (real Postgres in memory)
npx next build && npm run test:e2e   # browser flows with the installed Chrome and a throwaway database
```

## Catalog data

The catalog ships **empty on purpose**. Airlines, aircraft types and manufacturers are public reference data (`src/data/reference.ts`), but an item number or registration of a real release must not be guessed.

Until there is data, Smart Add recognises airline, type, manufacturer, scale, registration and item number from the typed text. It labels the result "Recognised from your search", not as a confirmed release. Unrecognised words such as a livery name stay marked for the user to check.

Ways to fill the catalog:

```bash
npm run catalog:import -- releases.csv --source "https://…" --verified
```

Or per model: "Suggest for catalog" on the detail page creates an unverified entry, visible to its author and moderators until verified on Explore. Check that you have the rights to any list or images you import.

## Architecture

```
src/data/reference.ts   airlines, aircraft types, manufacturers, registration prefixes
src/db/                 schema and connection (PGlite or Postgres)
src/lib/                pure logic shared by client and tests: search, smart parser, duplicates,
                        picker, stats, import mapping, i18n
src/server/             auth, item access, catalog, storage, FX, HTTP wrapper
src/app/api/            route handlers, validated with zod
src/components/         UI
scripts/                dev seed, catalog import, map generation
```

Decisions that differ from the brief, and why:

- **Collection and wishlist share `items`** with a status instead of two tables. A model moves between those states and must keep all its data.
- **Items hold a snapshot** of airline, type, livery and so on, plus optional links to reference data and the catalog. A user can correct a field without changing the shared catalog, and no release is required.
- **All of a user's items load into the browser**; search, filters, stats and the picker run client-side with virtualised lists. Filters need no requests, and "pick from current filters" and highlighting are exact. This suits several thousand models; far beyond that it would need a server-side query path.
- **PGlite for local use**, with the same SQL and migrations as production.
- **No shadcn/ui, Recharts or map library.** Own components and SVG charts keep the bundle small. CSS handles the animations.
- **Airline logos are left out**: they are trademarks and no licensed source is configured. `airlines.logo_url` exists for later.
- **No sample images.** A model without a photo shows a neutral silhouette for its airframe layout.

## Security

Every item query takes the owner's id (`src/server/items.ts`). Inputs are validated with zod on the server. Uploads are decoded and re-encoded through sharp, so non-images are refused and EXIF/GPS is removed. Images are served through an access check. Mutations get a same-origin check, session cookies are SameSite, and auth, uploads, imports and writes are rate limited. CSV/XLSX exports neutralise spreadsheet formulas. The share page builds its data field by field on the server, so hidden fields never reach the browser.

The in-process rate limiter counts per server instance. With several instances, replace it with a shared store.

## Not in this version

- OCR and AI extraction from photos. Barcode scanning is built with the browser's `BarcodeDetector` (the button is hidden where unsupported); it only finds a release once the catalog holds that barcode.
- Automatic market value lookup. `value_history.source` is ready for it.
- Background removal and purchase receipt uploads.
- Community tools: merging exists as a moderator API without a UI, and reports are stored without a review screen.
