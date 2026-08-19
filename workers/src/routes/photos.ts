import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import type { Scope } from "@loft/shared";
import {
  listPhotos,
  getVisiblePhoto,
  getUsableAlbum,
  softDeletePhoto,
  restorePhoto,
  updatePhotoAlbum,
  updatePhotoAlbumBulk,
  updatePhotoThumbMeta,
  makeCursor,
} from "../lib/db";
import { putBlob } from "../lib/r2";

const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 404 means "you can't see it" — never confirm that the partner's private
// content exists. 403 means "you can see it, but you may not do that", which
// leaks nothing (you already know it exists) and is far easier to debug.
const NOT_FOUND = { error: "not_found" } as const;
const NOT_OWNER = { error: "not_owner" } as const;

/** Keeps the generated `id IN (…)` list to a sane size. */
const MAX_BULK = 500;

r.get("/", async (c) => {
  const me = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const cursor = c.req.query("cursor") ?? null;
  const album_id = c.req.query("album_id") ?? null;
  const year_month = c.req.query("year_month") ?? null;
  const trash = c.req.query("trash") === "1";
  const rawScope = c.req.query("scope");
  const scope: Scope | "visible" = rawScope === "mine" || rawScope === "ours" ? rawScope : "visible";

  const photos = await listPhotos(c.env.DB, {
    viewerId: me.id,
    scope,
    limit,
    cursor,
    album_id,
    year_month,
    trash,
  });
  const next = photos.length === limit ? makeCursor(photos[photos.length - 1]) : null;
  return c.json({ photos, next_cursor: next });
});

r.get("/:id", async (c) => {
  const me = c.get("user");
  const p = await getVisiblePhoto(c.env.DB, c.req.param("id"), me.id);
  if (!p) return c.json(NOT_FOUND, 404);
  return c.json({ photo: p });
});

r.delete("/:id", async (c) => {
  const me = c.get("user");
  const photo = await getVisiblePhoto(c.env.DB, c.req.param("id"), me.id);
  if (!photo) return c.json(NOT_FOUND, 404);
  if (photo.owner_id !== me.id) return c.json(NOT_OWNER, 403);
  await softDeletePhoto(c.env.DB, photo.id, me.id, Date.now());
  return c.json({ ok: true });
});

r.post("/:id/restore", async (c) => {
  const me = c.get("user");
  const photo = await getVisiblePhoto(c.env.DB, c.req.param("id"), me.id);
  if (!photo) return c.json(NOT_FOUND, 404);
  if (photo.owner_id !== me.id) return c.json(NOT_OWNER, 403);
  await restorePhoto(c.env.DB, photo.id, me.id, Date.now());
  return c.json({ ok: true });
});

/**
 * Bulk file photos into an album. Registered BEFORE /:id so "album" is not
 * swallowed as a photo id.
 */
r.patch("/album", async (c) => {
  const me = c.get("user");
  const body = await c.req.json<{ photo_ids?: string[]; album_id?: string | null }>();
  const ids = (body.photo_ids ?? []).filter((v) => typeof v === "string");
  if (ids.length === 0) return c.json({ error: "photo_ids_required" }, 400);
  if (ids.length > MAX_BULK) return c.json({ error: "too_many", detail: `max ${MAX_BULK}` }, 400);
  if (body.album_id === undefined) return c.json({ error: "album_id_required" }, 400);

  if (body.album_id !== null) {
    const album = await getUsableAlbum(c.env.DB, body.album_id, me.id);
    if (!album) return c.json({ error: "album_not_found" }, 404);
  }

  const photos = await updatePhotoAlbumBulk(c.env.DB, ids, me.id, body.album_id, Date.now());
  // photos.length < ids.length means some weren't the caller's; that's expected,
  // not an error — the UI only ever offers your own photos anyway.
  return c.json({ photos, updated: photos.length, requested: ids.length });
});

r.patch("/:id", async (c) => {
  const me = c.get("user");
  const body = await c.req.json<{ album_id?: string | null }>();
  if (body.album_id === undefined) return c.json({ ok: true });

  const photo = await getVisiblePhoto(c.env.DB, c.req.param("id"), me.id);
  if (!photo) return c.json(NOT_FOUND, 404);
  if (photo.owner_id !== me.id) return c.json(NOT_OWNER, 403);

  // The target album must exist and be one this viewer may file into — their own
  // or a shared one. Previously there was no validation that it existed at all.
  if (body.album_id !== null) {
    const album = await getUsableAlbum(c.env.DB, body.album_id, me.id);
    if (!album) return c.json({ error: "album_not_found" }, 404);
  }

  await updatePhotoAlbum(c.env.DB, photo.id, me.id, body.album_id, Date.now());
  return c.json({ ok: true });
});

// Replace a photo's thumbnail + preview (used by the desktop backfill to give
// real frames to videos that were stored with a placeholder). Overwrites the
// existing R2 blobs; the client busts caches by versioning the URL with the
// new updated_at. Bumps updated_at so other devices pick it up via sync.
//
// Owner-only: it writes to photo.thumb_key / photo.preview_key, so unscoped
// either user could clobber the other's derivatives.
r.post("/:id/thumbnail", async (c) => {
  const me = c.get("user");
  const id = c.req.param("id");
  const photo = await getVisiblePhoto(c.env.DB, id, me.id);
  if (!photo) return c.json(NOT_FOUND, 404);
  if (photo.owner_id !== me.id) return c.json(NOT_OWNER, 403);

  const form = await c.req.formData();
  const thumb = form.get("thumb");
  const preview = form.get("preview");
  const metaRaw = form.get("metadata");

  const isBlob = (v: unknown): v is Blob =>
    !!v && typeof v === "object" && typeof (v as Blob).arrayBuffer === "function" && typeof (v as Blob).size === "number";

  if (!isBlob(thumb) || !isBlob(preview)) {
    return c.json({ error: "missing_files", detail: "thumb and preview required" }, 400);
  }

  let dims: { width: number | null; height: number | null; duration_ms: number | null } = {
    width: null,
    height: null,
    duration_ms: null,
  };
  if (typeof metaRaw === "string") {
    try {
      const m = JSON.parse(metaRaw) as Partial<typeof dims>;
      dims = {
        width: m.width ?? null,
        height: m.height ?? null,
        duration_ms: m.duration_ms ?? null,
      };
    } catch {
      return c.json({ error: "invalid_metadata_json" }, 400);
    }
  }

  await Promise.all([
    putBlob(c.env.BUCKET, photo.thumb_key, thumb),
    putBlob(c.env.BUCKET, photo.preview_key, preview),
  ]);

  const now = Date.now();
  await updatePhotoThumbMeta(c.env.DB, id, me.id, { ...dims, updated_at: now });

  const updated = await getVisiblePhoto(c.env.DB, id, me.id);
  return c.json({ photo: updated });
});

export default r;
