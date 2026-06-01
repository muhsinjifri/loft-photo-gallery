import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import {
  listPhotos,
  getPhoto,
  softDeletePhoto,
  restorePhoto,
  updatePhotoAlbum,
  updatePhotoThumbMeta,
} from "../lib/db";
import { putBlob } from "../lib/r2";

const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

r.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const cursor = c.req.query("cursor") ?? null;
  const album_id = c.req.query("album_id") ?? null;
  const year_month = c.req.query("year_month") ?? null;
  const trash = c.req.query("trash") === "1";
  const photos = await listPhotos(c.env.DB, { limit, cursor, album_id, year_month, trash });
  const next =
    photos.length === limit ? String(photos[photos.length - 1].taken_at ?? photos[photos.length - 1].uploaded_at) : null;
  return c.json({ photos, next_cursor: next });
});

r.get("/:id", async (c) => {
  const p = await getPhoto(c.env.DB, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  return c.json({ photo: p });
});

r.delete("/:id", async (c) => {
  await softDeletePhoto(c.env.DB, c.req.param("id"), Date.now());
  return c.json({ ok: true });
});

r.post("/:id/restore", async (c) => {
  await restorePhoto(c.env.DB, c.req.param("id"));
  return c.json({ ok: true });
});

r.patch("/:id", async (c) => {
  const body = await c.req.json<{ album_id?: string | null }>();
  if (body.album_id !== undefined) {
    await updatePhotoAlbum(c.env.DB, c.req.param("id"), body.album_id);
  }
  return c.json({ ok: true });
});

// Replace a photo's thumbnail + preview (used by the desktop backfill to give
// real frames to videos that were stored with a placeholder). Overwrites the
// existing R2 blobs; the client busts caches by versioning the URL with the
// new updated_at. Bumps updated_at so other devices pick it up via sync.
r.post("/:id/thumbnail", async (c) => {
  const id = c.req.param("id");
  const photo = await getPhoto(c.env.DB, id);
  if (!photo) return c.json({ error: "not_found" }, 404);

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
  await updatePhotoThumbMeta(c.env.DB, id, { ...dims, updated_at: now });

  const updated = await getPhoto(c.env.DB, id);
  return c.json({ photo: updated });
});

export default r;
