import { Hono, type Context } from "hono";
import type { Env, AppVariables } from "../env";
import { getVisiblePhoto } from "../lib/db";
import type { PhotoKind } from "@loft/shared";

const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
};

type Ctx = Context<{ Bindings: Env; Variables: AppVariables }, "/:id">;

async function serve(c: Ctx, kind: PhotoKind): Promise<Response> {
  const id = c.req.param("id");
  const me = c.get("user");

  // The visibility check MUST stay above cache.match: the cache key is the URL
  // alone, so a hit served before authorizing would hand the partner's bytes to
  // anyone who knows the id. Because the check runs first, the owner does not
  // need to be part of the cache key — the cache stays shared and hit rates are
  // unchanged.
  const photo = await getVisiblePhoto(c.env.DB, id, me.id);
  if (!photo) return c.json({ error: "not_found" }, 404);

  const key = kind === "thumb" ? photo.thumb_key : kind === "preview" ? photo.preview_key : photo.r2_key;
  const cacheKey = new Request(new URL(c.req.url).toString(), { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const object = await c.env.BUCKET.get(key);
  if (!object) return c.json({ error: "blob_missing" }, 404);

  const headers = new Headers(CACHE_HEADERS);
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("Content-Length", String(object.size));
  const resp = new Response(object.body, { headers });
  c.executionCtx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

r.get("/thumb/:id", (c) => serve(c, "thumb"));
r.get("/preview/:id", (c) => serve(c, "preview"));
r.get("/orig/:id", (c) => serve(c, "orig"));

export default r;
