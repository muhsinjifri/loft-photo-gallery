# Architecture & Design Decisions

This document explains **why** Loft is built the way it is — the cloud platform, the stack choices, and how the pieces connect. The goal of the whole project is a private, personal photo/video gallery that costs **~$0–3/month** and stays fast on a phone. Almost every decision flows from that constraint.

## TL;DR of the choices

| Decision | What | Why (in one line) |
|---|---|---|
| Cloud | **Cloudflare** | Generous free tier; R2 has **zero egress fees** — decisive for serving images. |
| Compute | **One Worker** | Runs at the edge, scales to zero, no servers to patch. |
| Host model | **Single Worker serves SPA + API** (no Pages) | Same-origin fixes iOS Safari cookie blocking for auth. |
| API framework | **Hono** | Tiny, fast, Workers-native router with great TS ergonomics. |
| Blob storage | **R2** | S3-compatible object store with **no egress cost**. |
| Database | **D1** (SQLite) | Serverless SQL, free tier, perfect for a single-user metadata table. |
| Auth | **Cloudflare Access** | A login wall in front of the Worker — zero auth code to write/maintain. |
| Frontend | **React + Vite + Tailwind** | Fast DX, familiar, great for a media-heavy SPA + PWA. |
| Image work | **In the browser** | Keeps the Worker on the free tier (no server CPU for resizing). |
| Offline mirror | **Dexie (IndexedDB) + delta sync** | Instant UI, works offline, keeps multiple devices in step. |

---

## 1. Why Cloudflare (the cloud)

A photo gallery is mostly about **storing big files and serving them cheaply**. That single requirement rules a lot in and out.

- **R2 has no egress fees.** This is the headline reason. On AWS S3, GCS, or Azure Blob, *downloading* your photos (bandwidth out) is where the bill grows — and a gallery is nothing but downloads. R2 charges for storage and operations but **not** for bytes served, so a gallery you browse daily doesn't accumulate a bandwidth bill.
- **Everything is on one platform's free tier.** Workers, R2, D1, and Access all have free or near-free tiers that comfortably cover a single user. No glue between three different vendors.
- **It runs at the edge, scales to zero.** No VM or container idling and costing money when you're not looking at photos. A Worker spins up per request and bills per request.
- **Access gives auth for free.** Cloudflare Access (part of Zero Trust) puts a Google-login wall in front of the app with a one-line email policy — no password storage, sessions, or OAuth code to own.

The trade-off accepted: you're tied to Cloudflare's primitives (Workers/R2/D1) rather than portable infrastructure. For a personal project where cost and simplicity beat portability, that's the right trade.

## 2. Why a single Worker — and not Cloudflare Pages + a separate API

This is the least obvious decision, so it gets its own section.

The "textbook" Cloudflare setup is **Pages** for the static frontend and a **separate Worker** for the API. Loft deliberately does **not** do that. Instead, **one Worker** serves both:

- the React SPA (static files from `web/dist`, via the Worker's `[assets]` binding), **and**
- the `/api/*` and `/img/*` routes (the Hono app).

**Why collapse them into one origin?** Authentication. With Pages-on-one-domain and the API-on-another, the browser makes **cross-site** requests, and the Cloudflare Access auth cookie becomes a third-party cookie. **iOS Safari blocks third-party cookies by default**, which broke Access auth on iPhone — exactly the device this gallery is meant to be used on. Serving the SPA and API from the **same origin** makes the auth cookie first-party, and the problem disappears.

Secondary benefits: no CORS configuration (same origin), one thing to deploy, one domain to wrap with Access.

> This is why the README and `CLAUDE.md` both say *"don't propose splitting it back into Pages + API."* It looks like an obvious refactor, but it reintroduces the iOS auth bug.

### How the single Worker routes a request

```
Request to loft-api.<subdomain>.workers.dev/<path>
        │
        ▼
1. [assets] binding — is <path> a real file in web/dist?  (e.g. /assets/app.js, /favicon.svg)
        │ yes → serve the static file (immutable, cached)
        │ no
        ▼
2. Hono app — does <path> match /api/* or /img/* ?
        │ yes → run the route handler (JSON API, or stream a blob from R2)
        │ no
        ▼
3. SPA fallback — not_found_handling = "single-page-application"
        → serve web/dist/index.html so React Router handles the client route
          (e.g. /albums, /a/:id, /m/:ym)
```

So static assets win first, then the API, and anything left over is treated as a client-side route and handed to the React app. All three live in the same Worker, behind the same Access policy.

## 3. Why Hono for the API

The Worker needs a router and request/response ergonomics. [Hono](https://hono.dev) is the natural fit:

- **Built for the edge.** It targets Workers (and other edge runtimes) first, so it's tiny and has no Node-only dependencies that fight the Workers runtime.
- **Fast and small.** Negligible cold-start and bundle-size impact — important when you bill per request and want quick startup.
- **Excellent TypeScript ergonomics.** Typed routes, middleware, and `c.req`/`c.json` helpers make the API code in `workers/src/routes/*` short and readable.
- **Just a router.** It doesn't drag in an ORM, a view layer, or opinions. Loft pairs it directly with the R2 and D1 **bindings** the Worker already has.

In short: Express-like DX, but designed for the runtime Loft actually deploys to.

## 4. Why R2 + D1 (storage split)

Loft separates **blobs** from **metadata**, the standard pattern for media apps:

- **R2 holds the bytes** — three immutable objects per item under key prefixes in one bucket: `orig/<uuid>.<ext>` (the original), `preview/<uuid>.jpg` (2048px), `thumb/<uuid>.jpg` (512px). Because the keys are UUIDs and the files never change, they're served with `Cache-Control: public, max-age=31536000, immutable` and cached forever at the edge.
- **D1 holds the facts** — one `photos` row per item (filename, dimensions, `taken_at`, `album_id`, EXIF JSON, `deleted_at`, etc.) plus an `albums` table. SQLite is more than enough for a single user's library, and D1 gives it to you serverless and free.

Why not stuff everything in one place? Object stores can't query ("give me June 2024, newest first") and databases shouldn't hold multi-megabyte blobs. Splitting them lets each do what it's good at: **R2 streams big files cheaply, D1 answers queries.** The `/img/*` routes read from R2; the `/api/*` routes read/write D1.

### The R2 cost model — storage vs. operations

R2 bills three separate things, and it's worth knowing which one actually matters, because the architecture is shaped to keep the other two near zero.

| What R2 charges for | Free each month | Beyond free | Does it grow for Loft? |
|---|---|---|---|
| **Storage** — bytes at rest | 10 GB | $0.015 / GB-month | **Yes** — the only real lever. |
| **Class A operations** — *writes* (`PutObject`, `ListObjects`, multipart) | 1 million | $4.50 / million | Barely. |
| **Class B operations** — *reads* (`GetObject`, `HeadObject`) | 10 million | $0.36 / million | Barely. |
| **Egress** — bytes served out | **Always free** | — | Never. |

"Operations" are simply **API calls against the bucket**, billed per call (not per byte). They split into two classes:

- **Class A = state changes (writes).** In Loft, one upload is **3 Class A ops** — it writes `orig/`, `preview/`, and `thumb/`. To exhaust the 1M free writes you'd have to upload ~330,000 items in a single month.
- **Class B = reads.** Serving an image is **1 Class B op** — but only on a **cache miss**. Because every blob is immutable and `/img/*` is edge-cached, a photo viewed 100 times is **1 op, not 100**: the edge cache absorbs the other 99. To exhaust the 10M free reads you'd need ten million cache-miss loads in a month.
- **Deletes are free** — the daily purge cron costs nothing in operations.

So the immutable-keys + edge-cache design isn't only about speed; it's what collapses Class B operations to near zero. **Storage is the single cost that scales with your library** — and even that is free under 10 GB, then ~$0.015/GB-month (a 100 GB library ≈ **$1.35/month**). Operations and egress stay effectively free for one person. *(The deployment-side view of this — free tiers per service, a billing table — is in [GETTING_STARTED.md → What it costs](GETTING_STARTED.md#what-it-costs).)*

## 5. Why the browser does the image processing

When you upload, the **browser** — not the Worker — generates the thumbnail and preview and reads EXIF:

1. `exifr` reads capture date / dimensions / GPS from the file.
2. `createImageBitmap` + `OffscreenCanvas` produce a 512px thumb and a 2048px preview JPEG.
3. For video, the first keyframe is decoded via **WebCodecs + mp4box** (honoring rotation), with a hidden-`<video>` fallback.
4. One multipart `POST /api/upload` ships `original + thumb + preview + metadata`; the Worker just stores 3 blobs and inserts 1 row.

**Why push this to the client?** Cost and simplicity. Image resizing is CPU-heavy; doing it in the Worker would burn CPU time (and money) and risk hitting limits. The user's device already has the file open and plenty of idle CPU, so the Worker stays a thin "store what you're given" layer and **never has to decode an image** — which is what keeps it firmly on the free tier.

The trade-off: the client must support the relevant browser APIs, and very large videos are bounded by the Worker's request-body limit (100 MB on the free tier).

## 6. Why React + Vite + Tailwind + Dexie on the frontend

- **React + Vite** — fast dev server and build, huge ecosystem, and a good fit for a stateful, media-heavy SPA. Vite also powers the PWA build (`vite-plugin-pwa`) so the app installs to a phone/desktop home screen.
- **Tailwind (+ Radix UI + Framer Motion)** — utility CSS for quick, consistent styling; Radix for accessible primitives (dialogs, menus); Framer Motion for the viewer/animation polish.
- **Dexie (IndexedDB) + a delta sync** — the frontend keeps a **local mirror** of the library in IndexedDB so the grid renders instantly and works offline. A lightweight poll to `GET /api/sync?since=<ts>` pulls only what changed (keyed off each row's `updated_at`), so opening the app on a second device quickly reflects album moves, deletes, and new uploads. This is what makes "edit on laptop, see it on phone" work without a heavy realtime backend.

## How it all connects (the full picture)

```
   Phone / Laptop (React PWA, installed)
        │  browse instantly from local Dexie mirror
        │  every 60s: GET /api/sync?since=<ts>  ──► pull only changed rows
        │  upload: resize in-browser, POST multipart /api/upload
        ▼
   ┌──────────────────────────── Cloudflare Access ────────────────────────────┐
   │  (single-email login wall — same first-party origin for SPA + API)        │
   │                                                                            │
   │   Cloudflare Worker  "loft-api"  (Hono + TypeScript)                       │
   │     • [assets]  → React SPA from web/dist (static, immutable-cached)       │
   │     • /api/*    → JSON: list/upload/album/delete/restore/sync  ─► D1       │
   │     • /img/*    → stream thumb/preview/orig blobs              ─► R2       │
   │     • cron 0 3 * * *  → purge soft-deleted items older than 30 days        │
   └────────────────────────────────────────────────────────────────────────────┘
            │                                   │
       ┌────▼────┐                         ┌────▼────┐
       │   R2    │  bytes (immutable)      │   D1    │  metadata (queryable)
       │ orig/   │                         │ photos  │
       │ preview/│                         │ albums  │
       │ thumb/  │                         └─────────┘
       └─────────┘
```

The throughline: **keep the server thin and cheap.** The browser does the heavy lifting (resizing, an offline mirror), Cloudflare's primitives do the storage and the auth, and a single edge Worker stitches them together at one origin so the whole thing is fast, private, and nearly free to run.
