# Loft — Project Context

Personal photo + video loft for **two residents** (you and your partner). Private (locked to the emails in `ALLOWED_EMAILS` via Cloudflare Access). Hosted on Cloudflare's free/cheap tier. Target cost: ~$0–3/mo.

Each person's library is **private by default**; an album can be marked **shared**, and both people see it and can add their own photos to it. Only the uploader may delete, move, or re-thumbnail a photo, even inside a shared album.

## Stack

| Layer | Tech |
|---|---|
| Storage | Cloudflare R2 — single `BUCKET` binding. Prod bucket `loft`; `loft-preview` is the preview/remote-dev bucket. `thumb/`, `preview/`, `orig/` are key prefixes in the *same* bucket (not separate buckets). |
| Database | Cloudflare D1 (SQLite, binding `DB`, name `loft-db`) |
| Backend + host | **One** Cloudflare Worker `loft-api` serves BOTH the SPA (static `[assets]` from `web/dist`, SPA-fallback routing) AND the `/api` + `/img` routes — same origin. TypeScript + Hono. **No Cloudflare Pages.** |
| Frontend | React 18 + Vite + TypeScript + Tailwind v3 (+ `@tailwindcss/forms`,`/typography`) + Radix UI + Framer Motion + React Router + Dexie (IndexedDB) |
| Auth | Cloudflare Access wrapping the Worker domain; policy lists both emails from `ALLOWED_EMAILS`. Identity resolves to a `users` row (`u1` = first email, `u2` = second). |
| PWA | vite-plugin-pwa (service worker + web manifest, install on phone/desktop) |

> **Why single Worker (not Pages + separate API):** same-origin avoids iOS Safari's cross-site cookie blocking that broke Cloudflare Access auth. Deployed at `loft-api.<your-subdomain>.workers.dev`. Don't propose splitting it back apart.

## Repo Layout (npm workspaces monorepo)

```
loft/
├── shared/           types shared between web + workers
│   └── src/types.ts
├── workers/          Cloudflare Worker — API + static asset host
│   ├── wrangler.toml         [assets] → ../web/dist (SPA fallback), R2/D1 bindings, daily cron
│   ├── migrations/           0001_init.sql, 0002_updated_at.sql, 0003_multi_user.sql, 0004_media_version.sql
│   └── src/
│       ├── index.ts          Hono app + cron purge handler
│       ├── auth.ts           Cf-Access header check
│       ├── env.ts            Env interface (bindings)
│       ├── lib/{db,r2,users}.ts
│       └── routes/{upload,photos,img,sync,albums,me}.ts
└── web/              React PWA frontend (built to web/dist, served by the Worker)
    ├── index.html            favicon + apple-touch-icon + iOS web-app meta tags
    ├── vite.config.ts        PWA manifest/icons; dev-only proxy /api + /img → :8787
    ├── public/               favicon.svg, icon.svg, icon-192/512.png, apple-touch-icon.png
    └── src/
        ├── App.tsx           router (client routes below)
        ├── main.tsx          entry
        ├── api.ts            fetch wrappers (+ ApiError, 401 handler, dev-user cookie)
        ├── user.tsx          UserProvider / useUser / RequireUser + identity-change guard
        ├── scope.tsx         Mine | Ours toggle state (context + localStorage)
        ├── filter.ts         queryPhotos() — the one predicate behind every grid
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

**`users` table:** `id, email, display_name, created_at` — `id` is positional from `ALLOWED_EMAILS` (`u1`, `u2`). Rows are auto-provisioned on a user's first request; there is no seeding step.

**`photos` table:** `id, r2_key, thumb_key, preview_key, filename, mime, size, width, height, duration_ms, taken_at, uploaded_at, updated_at, media_updated_at, album_id, year_month, exif_json, deleted_at, owner_id`

- `updated_at` (migration `0002`, indexed) is bumped on any mutation — album move, soft delete, restore, share/unshare. `GET /api/sync?since=<ts>` keys off it so other devices pick up changes.
- `media_updated_at` (migration `0004`) is bumped **only** where the thumb/preview R2 blobs are actually rewritten (`POST /api/photos/:id/thumbnail`). It — not `updated_at` — is what `cacheVer()` appends as `?v=` to image URLs. Keying the cache-bust off `updated_at` meant every metadata edit minted a new image URL, so filing a photo into an album re-downloaded it, and sharing an album re-downloaded *every photo in it* on both devices.

**`albums` table:** `id, name, cover_photo_id, created_at, owner_id, is_shared, updated_at`

**Visibility predicate** (`workers/src/lib/db.ts`): `owner_id = :me OR album_id IN (SELECT id FROM albums WHERE is_shared = 1)`. With exactly two users, `is_shared` *is* the membership list — a third user would need an `album_members` table. Its complement is spelled out as a separate `INVISIBLE` constant rather than `NOT (...)`, because `NOT (false OR NULL)` is NULL for a photo with no album and would silently drop it.

**R2 keys:** `u/<owner-id>/{orig,preview,thumb}/<uuid>.<ext>` — all immutable, `Cache-Control: public, max-age=31536000, immutable`. Objects written before migration `0003` keep their flat `orig/…` keys and still work, because every read resolves the key off the D1 row rather than reconstructing it.

## API Routes (all behind Cloudflare Access in prod, bypassed when `env.ENV === "dev"`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/upload` | multipart: original + thumb + preview + metadata JSON |
| GET | `/api/photos` | list, filters: `album_id`, `year_month`, `trash`, `cursor`, `limit` |
| GET | `/api/photos/:id` | one |
| PATCH | `/api/photos/:id` | assign album |
| PATCH | `/api/photos/album` | bulk-assign album (owner-scoped; registered before `/:id`) |
| DELETE | `/api/photos/:id` | soft delete |
| POST | `/api/photos/:id/restore` | undelete |
| GET | `/api/sync?since=<ts>` | delta for Dexie mirror (see **Sync contract**) |
| GET / POST | `/api/albums` | list / create |
| PATCH | `/api/albums/:id` | rename / share / unshare — **owner only** |
| GET / PATCH | `/api/me` | current user + everyone's display names |
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

## Sync Contract

`GET /api/sync?since=<ts>` returns `{ photos, albums, removed_photo_ids, server_time }`.

- **`albums` is the full authoritative set, not a delta.** The client *replaces* its album table with it. The old query filtered albums on `created_at`, so renames and share-flips never reached another device.
- **`removed_photo_ids`** = rows that changed since `since` and are no longer visible to the caller. Computed on the fly (`CHANGED AND INVISIBLE`); there is no tombstone table and no retention horizon. Skipped when `since=0`, where a fresh client has nothing to remove.
- **Sharing an album bumps `updated_at` on every photo in it** (`PATCH /api/albums/:id`, one `db.batch`). This is mandatory: without it, an existing album's photos are older than the partner's sync cursor and the newly shared album shows up empty for them.
- The client runs `fullResync()` (`since=0`, authoritative) on boot and the cheap delta on the 60s poll.

## Permissions

| Action | Rule |
|---|---|
| View a photo | own, or in a shared album |
| Delete / restore / re-thumbnail | **owner only** → 403 |
| Move a photo to an album | must own the photo, and the target album must be own-or-shared |
| Rename / share / unshare an album | **album owner only** → 403 |
| Add your photo to the partner's shared album | allowed |

404 means "you can't see it" (never confirm the partner's private content exists); 403 means "you can see it but may not do that".

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
6. CF Zero Trust → Access app → wrap the single Worker domain (`loft-api.<your-subdomain>.workers.dev`), policy: **both** addresses from `ALLOWED_EMAILS`. This is a second, independent gate — until it lists the partner, they never reach the Worker at all. No Pages project exists.

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
- **`NOT (a OR b)` is not the complement of `(a OR b)` in SQL.** For a photo with `album_id IS NULL`, `NOT (owner_id = ? OR album_id IN (…))` evaluates to `NOT (false OR NULL)` = NULL, which is not TRUE, so the row vanishes from the result. This silently broke `removed_photo_ids` for the most ordinary un-share there is (moving one picture out of a shared album). Hence the explicit `INVISIBLE` constant in `lib/db.ts`.
- **The `[assets]` `not_found_handling` setting never runs when a Worker is present.** Anything not matching a static asset goes to the Worker, so a deep link or hard refresh on a client route hits Hono's `notFound`. `index.ts` therefore falls back to `env.ASSETS.fetch()` for GET/HEAD on non-`/api`, non-`/img` paths. Without it every client route returns `{"error":"not_found"}` on a cold load — the service worker's precached shell was hiding this.
- **Dev identity uses the `loft_dev_user` cookie, not just the `X-Dev-User` header.** `/img/*` is loaded via plain `<img src>`, which cannot send a custom header; a header-only scheme makes every thumbnail 404 the instant you switch user. The header is kept for `curl`. Both are ignored unless `ENV === "dev"`.
- **`/img/*` checks visibility BEFORE `cache.match`.** The edge cache key is the URL alone, so authorizing after a cache hit would serve the partner's bytes to anyone with the id. Because the D1 gate runs first, the owner does *not* need to be in the cache key.
- **Un-sharing cannot revoke bytes already in the partner's service-worker cache** (`immutable, max-age=1y`). The D1 gate stops all new reads; already-downloaded thumbnails persist on their device until that cache is cleared.
- **Secrets never go in `wrangler.toml`** (it's committed to git). The IDs there — `database_id`, bucket names, `ALLOWED_EMAILS` — are identifiers, not credentials. This public repo ships them as placeholders (`YOUR_D1_DATABASE_ID`, `you@example.com`); `account_id` is omitted entirely (Wrangler reads `CLOUDFLARE_ACCOUNT_ID` / auto-detects from login). A *real* secret (third-party API key, etc.) goes via `wrangler secret put NAME` (encrypted on CF, accessed as `env.NAME`); local dev equivalents go in `workers/.dev.vars` (gitignored). The wrangler login token lives in `~/Library/Preferences/.wrangler/config/` — never in the repo. Loft currently has zero secrets.

## Out of Scope (v2+)

Face recognition, **three or more users** (the `is_shared` shortcut assumes exactly two), per-photo sharing outside an album, video transcoding, presigned uploads, native mobile app, bulk CLI import, map view (data already captured via EXIF GPS).

