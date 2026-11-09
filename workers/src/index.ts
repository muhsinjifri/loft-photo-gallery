import { Hono } from "hono";
import type { Env, AppVariables } from "./env";
import { auth } from "./auth";
import upload from "./routes/upload";
import photos from "./routes/photos";
import img from "./routes/img";
import sync from "./routes/sync";
import albums from "./routes/albums";
import me from "./routes/me";
import push from "./routes/push";
import uploadKey from "./routes/uploadKey";
import { allowedEmails } from "./env";
import { accessConfigured, verifyAccessJwt } from "./lib/access";
import { clearCookie, SESSION_COOKIE, sessionCookie, signSession } from "./lib/session";
import { getCookie } from "hono/cookie";
import { findExpiredDeletes, hardDeletePhotos } from "./lib/db";
import { deleteMany } from "./lib/r2";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// /api/push authenticates with a personal upload key instead of the session, so
// an Apple Shortcut can call it. It is the only /api route outside `auth`.
app.use("/api/*", (c, next) => (c.req.path === "/api/push" ? next() : auth(c, next)));
app.use("/img/*", auth);

// API responses must never be cached — otherwise iOS Safari serves a stale
// /api/sync and changes from other devices don't appear after a refresh.
// (/img/* stays immutable-cacheable, handled in its own route.)
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.get("/health", (c) => c.json({ ok: true, env: c.env.ENV }));

/** Only same-origin paths, so /login can't be used as an open redirect. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/login")) return "/";
  return raw;
}

function page(title: string, body: string, status: 401 | 500): Response {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px -apple-system,system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#F2F2F7;color:#1c1c1e;padding:16px}@media(prefers-color-scheme:dark){body{background:#000;color:#f2f2f7}}main{max-width:420px;text-align:center}a{color:#007AFF}</style><main><h1 style="font-size:22px">${title}</h1><p>${body}</p></main>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// The one door. Cloudflare Access guards ONLY this path: it signs you in with
// your email, then this hands your device Loft's own year-long cookie and sends
// you into the app. Access sessions max out at a month; this one slides forward
// every time you use the app, so you don't see the email login again.
app.get("/login", async (c) => {
  const next = safeNext(c.req.query("next"));
  if (c.env.ENV === "dev") return c.redirect(next);
  if (!c.env.SESSION_SECRET || !accessConfigured(c.env)) {
    return page("Loft isn't set up yet", "SESSION_SECRET, ACCESS_TEAM_DOMAIN and ACCESS_AUD must be set on the Worker.", 500);
  }
  const jwt = c.req.header("Cf-Access-Jwt-Assertion") ?? getCookie(c, "CF_Authorization");
  const email = await verifyAccessJwt(c.env, jwt);
  if (!email) {
    return page(
      "Couldn't sign you in",
      "Cloudflare Access didn't vouch for this request. Check that the Access application covers <code>/login</code>.",
      401,
    );
  }
  if (!allowedEmails(c.env).includes(email)) {
    return page(
      "This loft is private",
      `${email.replace(/[<>&"]/g, "")} isn't one of the residents. <a href="/cdn-cgi/access/logout">Use a different email</a>.`,
      401,
    );
  }
  c.header("Set-Cookie", sessionCookie(await signSession(c.env.SESSION_SECRET, email), true));
  c.header("Cache-Control", "no-store");
  return c.redirect(next);
});

// Drops Loft's cookie AND the Access one — the middleware also accepts a valid
// Access JWT, so leaving CF_Authorization behind would sign you straight back in.
app.post("/logout", (c) => {
  const secure = c.env.ENV !== "dev";
  c.header("Set-Cookie", clearCookie(SESSION_COOKIE, secure), { append: true });
  c.header("Set-Cookie", clearCookie("CF_Authorization", secure), { append: true });
  c.header("Cache-Control", "no-store");
  return c.json({ ok: true });
});

app.route("/api/upload", upload);
app.route("/api/photos", photos);
app.route("/api/sync", sync);
app.route("/api/albums", albums);
app.route("/api/me", me);
app.route("/api/upload-key", uploadKey);
app.route("/api/push", push);
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
