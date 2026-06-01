# Loft — Project Context

Personal, single-user photo + video loft. Private (locked to one email via Cloudflare Access). Hosted on Cloudflare's free/cheap tier. Target cost: ~$0–3/mo.

## Stack

| Layer | Tech |
|---|---|
| Storage | Cloudflare R2 — single `BUCKET` binding. Prod bucket `loft`; `loft-preview` is the preview/remote-dev bucket. `thumb/`, `preview/`, `orig/` are key prefixes in the *same* bucket (not separate buckets). |
| Database | Cloudflare D1 (SQLite, binding `DB`, name `loft-db`) |
| Backend + host | **One** Cloudflare Worker `loft-api` serves BOTH the SPA (static `[assets]` from `web/dist`, SPA-fallback routing) AND the `/api` + `/img` routes — same origin. TypeScript + Hono. **No Cloudflare Pages.** |
| Frontend | React 18 + Vite + TypeScript + Tailwind v3 (+ `@tailwindcss/forms`,`/typography`) + Radix UI + Framer Motion + React Router + Dexie (IndexedDB) |
| Auth | Cloudflare Access (Google login, single-email policy) wrapping the Worker domain |
| PWA | vite-plugin-pwa (service worker + web manifest, install on phone/desktop) |

> **Why single Worker (not Pages + separate API):** same-origin avoids iOS Safari's cross-site cookie blocking that broke Cloudflare Access auth. Deployed at `loft-api.<your-subdomain>.workers.dev`. Don't propose splitting it back apart.

## Repo Layout (npm workspaces monorepo)

```
loft/
├── shared/           types shared between web + workers
│   └── src/types.ts
├── workers/          Cloudflare Worker — API + static asset host
│   ├── wrangler.toml         [assets] → ../web/dist (SPA fallback), R2/D1 bindings, daily cron
│   ├── migrations/           0001_init.sql, 0002_updated_at.sql
│   └── src/
│       ├── index.ts          Hono app + cron purge handler
│       ├── auth.ts           Cf-Access header check
│       ├── env.ts            Env interface (bindings)
│       ├── lib/{db,r2}.ts
│       └── routes/{upload,photos,img,sync,albums}.ts
└── web/              React PWA frontend (built to web/dist, served by the Worker)
    ├── index.html            favicon + apple-touch-icon + iOS web-app meta tags
    ├── vite.config.ts        PWA manifest/icons; dev-only proxy /api + /img → :8787
    ├── public/               favicon.svg, icon.svg, icon-192/512.png, apple-touch-icon.png
    └── src/
        ├── App.tsx           router (client routes below)
        ├── main.tsx          entry
        ├── api.ts            fetch wrappers
        ├── db.ts             Dexie schema mirroring D1
        ├── sync.ts           server → Dexie delta sync (polls every 60s)
        ├── backfill.ts       client-side backfill of missing thumb/preview derivatives
        ├── thumb.ts / videoFrameWebCodecs.ts   canvas/WebCodecs resize + EXIF read
        ├── routes/           Home, Calendar, Month, Albums, AlbumDetail, Trash, Settings, NotAuthorized
        ├── components/       AppShell, MasonryGrid, Viewer, Upload/*, Mobile{TopBar,BottomNav}, skeletons/, illustrations/, flourishes/
        └── hooks/            useColumnCount
```

**Client routes** (`App.tsx`): `/` · `/calendar` · `/m/:ym` · `/albums` · `/a/:id` · `/trash` · `/settings` · `/not-authorized`

## Commands

```bash
# Local dev (run in two terminals)
npm run dev:api        # Worker on http://localhost:8787 (miniflare, local R2+D1)
npm run dev:web        # Vite on http://localhost:5173

# DB
npm run db:migrate:local      # apply migrations to local D1
npm run db:migrate:remote     # apply to production D1

# Deploy (one Worker serves frontend + API)
npm run deploy                # build:web + wrangler deploy — the usual one-shot
npm run build:web             # build frontend only (outputs web/dist)
npm run deploy:api            # wrangler deploy only (assumes web/dist already built)

# Typecheck all packages
npm run typecheck
```

## Data Model

**`photos` table:** `id, r2_key, thumb_key, preview_key, filename, mime, size, width, height, duration_ms, taken_at, uploaded_at, updated_at, album_id, year_month, exif_json, deleted_at`

- `updated_at` (migration `0002`, indexed) is bumped on any mutation — album move, soft delete, restore. `GET /api/sync?since=<ts>` keys off it so other devices pick up changes.

**`albums` table:** `id, name, cover_photo_id, created_at`

**R2 keys:** `orig/<uuid>.<ext>`, `preview/<uuid>.jpg`, `thumb/<uuid>.jpg` — all immutable, `Cache-Control: public, max-age=31536000, immutable`.

## API Routes (all behind Cloudflare Access in prod, bypassed when `env.ENV === "dev"`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/upload` | multipart: original + thumb + preview + metadata JSON |
| GET | `/api/photos` | list, filters: `album_id`, `year_month`, `trash`, `cursor`, `limit` |
| GET | `/api/photos/:id` | one |
| PATCH | `/api/photos/:id` | assign album |
| DELETE | `/api/photos/:id` | soft delete |
| POST | `/api/photos/:id/restore` | undelete |
| GET | `/api/sync?since=<ts>` | delta for Dexie mirror |
| GET / POST | `/api/albums` | list / create |
| GET | `/img/{thumb,preview,orig}/:id` | R2 serve, edge-cached |
| GET | `/health` | unauthenticated probe |

## Image Pipeline

Browser does all resize work (zero Worker CPU):
1. `exifr.parse(file)` — read EXIF (date, GPS, etc.)
2. `createImageBitmap` + `OffscreenCanvas` → 512px thumb + 2048px preview JPEG @ 0.92 quality
3. Video: decode the first keyframe via WebCodecs + mp4box demux (`videoFrameWebCodecs.ts`), honoring the track rotation matrix; falls back to a hidden `<video>` element + canvas when WebCodecs/the codec is unsupported. Dark intro frames are skipped so the thumb isn't black.
4. POST multipart: `original` + `thumb` + `preview` + `metadata` JSON
5. Worker stores 3 R2 blobs + inserts D1 row

Constants in `shared/src/types.ts`: `THUMB_PX=512`, `PREVIEW_PX=2048`, `JPEG_QUALITY=0.92`, `MAX_UPLOAD_BYTES=100MB`.

## Soft Delete

`DELETE /api/photos/:id` sets `deleted_at = now`. Daily cron (`0 3 * * *`) runs `purgeExpired` — deletes R2 blobs + D1 rows where `deleted_at < now - 30d`.

## Local Dev Notes

- Miniflare simulates R2 + D1 in `workers/.wrangler/state/` — fully offline, no CF account needed
- `env.ENV === "dev"` in `wrangler.toml` skips Access auth check
- No CORS handling in the Worker — app + API are same-origin. In dev, Vite's proxy (`changeOrigin`) forwards `/api` + `/img` to `:8787`, so the browser only ever talks to `:5173`
- Dexie persists in browser IndexedDB across refreshes — clear via DevTools → Application → Storage

## Production Deploy Checklist

1. `wrangler login` (personal CF account)
2. `wrangler r2 bucket create loft && wrangler r2 bucket create loft-preview` (`loft-preview` only used for `wrangler dev --remote` previews)
3. `wrangler d1 create loft-db` → paste `database_id` into `workers/wrangler.toml`
4. `npm run db:migrate:remote` (applies all migrations to prod D1)
5. `npm run deploy` (builds `web/dist`, then `wrangler deploy` ships the Worker **with** the static assets)
6. CF Zero Trust → Access app → wrap the single Worker domain (`loft-api.<your-subdomain>.workers.dev`), policy: email = the address you set as `ALLOWED_EMAIL`. No Pages project exists.

## Known Gotchas

- **Dexie `orderBy(field).reverse()` drops NULL rows.** Always `.filter().toArray()` then `sort()` in JS when sorting by a nullable column (we sort by `taken_at ?? uploaded_at`).
- **Worker `instanceof File` fails type-check** under `@cloudflare/workers-types`. Use a duck-type Blob check (`typeof v.arrayBuffer === "function"`) instead.
- **`exifr` strict TS types** reject mixed format/segment options. Pass `{ gps: true }` only.
- **Upload >100MB** rejected by Worker free-tier body limit. v2 will add presigned R2 PUT URL flow.
- **Video transcoding not done.** Original served as-is; browser must support the codec.
- **Edge cache** keyed by full URL. Since R2 keys are UUIDs (immutable), safe to cache forever.
- **iOS ignores the web-manifest icons for "Add to Home Screen."** Must ship `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` (180×180, opaque) in `web/index.html` or iOS shows an auto-generated "L" monogram. `apple-mobile-web-app-capable=yes` meta (also in `index.html`) is what makes it launch standalone — the manifest `display:standalone` alone is not enough on iOS. iOS caches the icon at install time, so **delete + re-add to home screen** to refresh it.
- **API responses are `Cache-Control: no-store`** (set in `index.ts`) so iOS Safari doesn't serve a stale `/api/sync` and miss cross-device changes. `/img/*` stays immutable-cacheable (handled in its route).
- **Single Worker + `[assets]` routing:** static files in `web/dist` are served first; non-asset paths fall through to the Hono app; unknown client routes get the SPA `index.html` (`not_found_handling = "single-page-application"`). In **local dev** the SPA is served by Vite (`:5173`) and the API by `wrangler dev` (`:8787`) via Vite's proxy — the `[assets]` binding is only exercised in prod.
- **Secrets never go in `wrangler.toml`** (it's committed to git). The IDs there — `database_id`, bucket names, `ALLOWED_EMAIL` — are identifiers, not credentials. This public repo ships them as placeholders (`YOUR_D1_DATABASE_ID`, `you@example.com`); `account_id` is omitted entirely (Wrangler reads `CLOUDFLARE_ACCOUNT_ID` / auto-detects from login). A *real* secret (third-party API key, etc.) goes via `wrangler secret put NAME` (encrypted on CF, accessed as `env.NAME`); local dev equivalents go in `workers/.dev.vars` (gitignored). The wrangler login token lives in `~/Library/Preferences/.wrangler/config/` — never in the repo. Loft currently has zero secrets.

## Out of Scope (v2+)

Face recognition, sharing/multi-user, video transcoding, presigned uploads, native mobile app, bulk CLI import, map view (data already captured via EXIF GPS).

