# Getting Started

This guide takes you from a fresh clone to your **own private photo loft running on Cloudflare** — with nothing assumed. Read it top to bottom the first time.

There are two things you can do:

- **[Part A — Run it locally](#part-a--run-it-locally)** in ~3 minutes, fully offline, to try it out. *(No Cloudflare account needed.)*
- **[Part B — Deploy your own private Loft](#part-b--deploy-your-own-private-loft)** to the internet, locked to your email. *(Needs a free Cloudflare account.)*

If you just want to see it work, do Part A. If you want to actually store your photos, you'll do Part B.

---

## What you're setting up

Loft is **one** Cloudflare Worker that serves both the web app and its API. It stores image/video files in **R2** (object storage) and their info in **D1** (a SQLite database). **Cloudflare Access** is the login wall that keeps the whole thing private to you.

```
   Your browser  ──►  Cloudflare Worker  ──►  R2 (the photo/video files)
   (the web app)      (app + API)        └─►  D1 (filenames, dates, albums…)
                          ▲
                          └── Cloudflare Access = the login wall (just you)
```

You don't need to understand all of it to follow the steps — just know those are the four pieces.

---

## Prerequisites

| You need | Why | How to check / get it |
|---|---|---|
| **Node.js 22** | Builds the app and runs the tooling | `node -v` → should print `v22.x`. Get it from [nodejs.org](https://nodejs.org) or `nvm install 22` (the repo has an `.nvmrc`). |
| **Git** | To clone the repo | `git --version` |
| **A Cloudflare account** *(Part B only)* | Hosts the Worker, R2, D1, and Access | Free signup at [dash.cloudflare.com](https://dash.cloudflare.com). The free tier is enough to start. |

> You do **not** need to install Wrangler (Cloudflare's CLI) separately — it comes with the project as a dev dependency and runs via `npm`/`npx`.

---

## Part A — Run it locally

This runs everything on your own machine using a built-in simulator (Miniflare), so there's **no Cloudflare account and no internet dependency**. Auth is turned off locally so you can jump straight in.

### 1. Get the code and install

```bash
git clone https://github.com/muhsinjifri/loft-photo-gallery.git
cd loft-photo-gallery
npm install
```

`npm install` sets up all three workspaces (`shared`, `workers`, `web`) at once.

### 2. Turn off the login wall for local dev

The Worker checks for a login on every API request **unless** it's told it's in dev mode. You tell it that with a small file:

```bash
cp workers/.dev.vars.example workers/.dev.vars
```

That file just contains `ENV=dev`. It's gitignored and stays on your machine.

> **If you skip this step, every local API call returns `401 Unauthorized`** and the app loads but shows no photos. This is the #1 local-setup gotcha.

### 3. Create the local database

```bash
npm run db:migrate:local
```

This builds an empty SQLite database (the `photos` and `albums` tables) inside `workers/.wrangler/`. You only need to do this once (and again whenever new migrations are added).

### 4. Start it (two terminals)

Open **two** terminal tabs in the project folder and run one command in each:

```bash
# Terminal 1 — the Worker (API + storage), on http://localhost:8787
npm run dev:api
```

```bash
# Terminal 2 — the web app, on http://localhost:5173
npm run dev:web
```

### 5. Open it

Go to **http://localhost:5173**.

You'll see an empty gallery. Click the **upload** button (the **＋** floating button, or drag-and-drop files onto the window) and add a few photos or short videos. They're stored in your local simulated R2/D1 and appear in the timeline. That's the whole app, running on your machine.

> **Why two servers?** In dev, the web app runs on Vite (`:5173`) for instant hot-reload, and the Worker runs separately (`:8787`). Vite quietly forwards `/api` and `/img` requests to the Worker, so your browser only ever talks to `:5173`. In production (Part B) it's all **one** server.

To stop, press `Ctrl+C` in each terminal.

---

## Part B — Deploy your own private Loft

Now we'll put your Loft on the internet at a `*.workers.dev` URL and lock it to your email. Every command runs from the project root.

### Step 1 — Log in to Cloudflare

```bash
npx wrangler login
```

A browser window opens; approve the access. This links Wrangler to your Cloudflare account. (Run `npx wrangler whoami` to confirm.)

### Step 2 — Create the two storage buckets (R2)

```bash
npx wrangler r2 bucket create loft
npx wrangler r2 bucket create loft-preview
```

- `loft` is where your real photos/videos live.
- `loft-preview` is only used if you ever run `wrangler dev --remote`; create it anyway so the config is valid.

> **One-time setup:** the first time you use R2, Cloudflare makes you **add a payment method** to activate the R2 subscription. This does **not** mean you'll be charged — R2 has a **forever-free tier of 10 GB of storage** (plus 1M writes / 10M reads per month), and **egress is always free**. You only pay if you exceed those, and then only pennies (see [What it costs](#what-it-costs)). Tip: set a billing alert in the Cloudflare dashboard for peace of mind.
>
> R2 being egress-free is exactly what makes Loft cheap — browsing your own photos never adds a bandwidth bill.

### Step 3 — Create the database (D1) and paste its ID

```bash
npx wrangler d1 create loft-db
```

This prints a block like:

```
[[d1_databases]]
binding = "DB"
database_name = "loft-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   ← copy this value
```

Open **`workers/wrangler.toml`**, find the line:

```toml
database_id = "YOUR_D1_DATABASE_ID"
```

…and replace `YOUR_D1_DATABASE_ID` with the id you just copied. (This id has to be written into the file — it can't be an environment variable.)

### Step 4 — Set your email

In the same **`workers/wrangler.toml`**, find:

```toml
ALLOWED_EMAIL = "you@example.com"
```

Change it to the email **you'll log in with**. This is the only person the deployed app will let in.

### Step 5 — Build the database tables in production

```bash
npm run db:migrate:remote
```

This applies the same migrations from Part A to your real D1 database. Confirm when prompted.

### Step 6 — Deploy

```bash
npm run deploy
```

This builds the web app and ships the Worker **with the web app bundled inside it**. When it finishes, Wrangler prints your live URL:

```
https://loft-api.<your-subdomain>.workers.dev
```

> **Heads up:** at this moment your app is deployed but **not yet locked down**. The web page will load, but the API returns `401` for everyone (there's no login configured yet), so no photos load and you can't use it. The next step fixes that — it's required, not optional.

### Step 7 — Turn on the login wall (Cloudflare Access)

This is what makes the Loft private *and* what lets **you** log in. The easiest way is the one-click button:

1. In the [Cloudflare dashboard](https://dash.cloudflare.com), go to **Workers & Pages** and click your **`loft-api`** Worker.
2. Go to **Settings → Domains & Routes**.
3. Next to your `workers.dev` URL, click **Enable Cloudflare Access**.
4. Click **Manage Cloudflare Access** and make sure the policy allows **only your email** (the same one you set as `ALLOWED_EMAIL` in Step 4). Remove any broader rules.
5. Save.

> The first time you use Access, Cloudflare may ask you to set up **Zero Trust** (pick a team name; the free plan covers up to 50 users). For the login method, **One-time PIN** is the simplest — Cloudflare emails you a code, no Google setup required. You can switch to Google login later if you prefer.

Behind the scenes: after you log in, Access adds a verified `Cf-Access-Authenticated-User-Email` header to every request, and the Worker only lets the request through if that email matches `ALLOWED_EMAIL`. That's the whole auth model.

### Step 8 — Use it

1. Open your `https://loft-api.<your-subdomain>.workers.dev` URL.
2. You'll get a Cloudflare login screen → enter your email → get the one-time code (or sign in with Google) → you're in.
3. Upload photos/videos with the **＋** button or by dragging files in.
4. **Install it on your phone:** open the URL in Safari (iPhone) or Chrome (Android) → **Share / menu → Add to Home Screen**. It launches like a native app (it's a PWA).

You're done. You now have a private photo loft running for roughly the cost of a coffee per *year* at small scale.

---

## Updating later

When you pull new changes (or make your own), redeploy with one command:

```bash
git pull          # if you're tracking this repo
npm run deploy    # rebuilds the web app + redeploys the Worker
```

If a change adds a new database migration, also run `npm run db:migrate:remote` before/after deploying.

---

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev:api` | Run the Worker locally (port 8787) |
| `npm run dev:web` | Run the web app locally (port 5173) |
| `npm run db:migrate:local` | Apply DB migrations to the local simulator |
| `npm run db:migrate:remote` | Apply DB migrations to production D1 |
| `npm run typecheck` | Type-check all three workspaces |
| `npm run build:web` | Build just the frontend (`web/dist`) |
| `npm run deploy` | Build web + deploy the Worker (the usual one) |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Local app loads but shows no photos; API calls are `401`** | Missing dev flag | Create `workers/.dev.vars` with `ENV=dev` (`cp workers/.dev.vars.example workers/.dev.vars`), then restart `npm run dev:api`. |
| **`node -v` shows v18/v20** | Wrong Node version | Install Node 22 (`nvm install 22 && nvm use 22`). |
| **Deploy succeeds but the live site shows nothing / `401`** | Access login not set up yet | Do Part B, Step 7 (Enable Cloudflare Access) and log in. |
| **You can log in but get "not authorized"** | `ALLOWED_EMAIL` doesn't match your login email | Make the email in `wrangler.toml` and the email in the Access policy identical, then `npm run deploy`. |
| **`database_id` / "no such table" errors after deploy** | Forgot to paste the D1 id or run remote migrations | Re-check Step 3 (paste the real id) and run `npm run db:migrate:remote`. |
| **Upload of a large video is rejected** | Worker free-tier request limit | Files must be **under 100 MB**. |
| **A video's thumbnail is wrong/black** | Codec not supported, or unusual frames | The original still plays if your browser supports the codec; thumbnails are best-effort. |
| **Wrangler can't find your account / multiple accounts** | Account not selected | Set it: `export CLOUDFLARE_ACCOUNT_ID=<your-account-id>` (find it in the dashboard URL or **Workers & Pages** overview), then redeploy. |

---

## What it costs

For a single user with a personal library, Loft typically lands at **$0–3/month**:

- **Workers, D1, Access** — comfortably within the free tiers at this scale, and **no payment method required** to use them.
- **R2** — **does require a payment method to activate** (a one-time step when you create your first bucket), but it has a generous free tier and bills only for what you go over:

  | R2 resource | Free each month | Cost beyond free |
  |---|---|---|
  | Storage | **10 GB** | $0.015 / GB-month |
  | Uploads (Class A ops) | 1 million | $4.50 / million |
  | Views (Class B ops) | 10 million | $0.36 / million |
  | Egress (bandwidth out) | **Always free** | — |

  So a library **under ~10 GB costs $0**. Above that, only the storage overage is billed — e.g. a **50 GB** library ≈ **$0.60/month**, a **100 GB** library ≈ **$1.35/month**. Egress being free means browsing your photos never adds a bandwidth bill, and Loft edge-caches images so repeat views rarely even hit R2.

  > 💡 Set a **billing alert** in the Cloudflare dashboard so you're notified well before any meaningful charge.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** if you want the reasoning behind these choices and how the pieces fit together.
