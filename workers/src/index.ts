import { Hono } from "hono";
import type { Env, AppVariables } from "./env";
import { auth } from "./auth";
import upload from "./routes/upload";
import photos from "./routes/photos";
import img from "./routes/img";
import sync from "./routes/sync";
import albums from "./routes/albums";
import me from "./routes/me";
import { findExpiredDeletes, hardDeletePhotos } from "./lib/db";
import { deleteMany } from "./lib/r2";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("/api/*", auth);
app.use("/img/*", auth);

// API responses must never be cached — otherwise iOS Safari serves a stale
// /api/sync and changes from other devices don't appear after a refresh.
// (/img/* stays immutable-cacheable, handled in its own route.)
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.get("/health", (c) => c.json({ ok: true, env: c.env.ENV }));

app.route("/api/upload", upload);
app.route("/api/photos", photos);
app.route("/api/sync", sync);
app.route("/api/albums", albums);
app.route("/api/me", me);
app.route("/img", img);

// With a Worker present, anything that doesn't match a static asset is handed to
// the Worker — the [assets] `not_found_handling = "single-page-application"`
// setting never gets a chance to run. Without this, a hard load or deep link to
// any client route (/albums, /settings, /not-authorized …) returns JSON instead
// of the app; it only appeared to work because the service worker was serving
// the precached shell.
app.notFound(async (c) => {
  const { pathname } = new URL(c.req.url);
  const isApi = pathname.startsWith("/api/") || pathname.startsWith("/img/");
  const isNavigation = c.req.method === "GET" || c.req.method === "HEAD";
  if (isApi || !isNavigation) return c.json({ error: "not_found" }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});
app.onError((e, c) => {
  console.error(e);
  return c.json({ error: "internal", detail: String(e) }, 500);
});

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(purgeExpired(env));
  },
};

async function purgeExpired(env: Env): Promise<void> {
  const cutoff = Date.now() - RETENTION_MS;
  const expired = await findExpiredDeletes(env.DB, cutoff);
  if (expired.length === 0) return;
  const r2Keys = expired.flatMap((p) => [p.r2_key, p.preview_key, p.thumb_key]);
  await deleteMany(env.BUCKET, r2Keys);
  await hardDeletePhotos(
    env.DB,
    expired.map((p) => p.id),
  );
  console.log(`purged ${expired.length} photos`);
}
