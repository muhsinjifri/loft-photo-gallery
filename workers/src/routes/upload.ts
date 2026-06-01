import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import type { UploadMetadata, Photo } from "@loft/shared";
import { MAX_UPLOAD_BYTES } from "@loft/shared";
import { putBlob } from "../lib/r2";
import { insertPhoto } from "../lib/db";

const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function uuid(): string {
  return crypto.randomUUID();
}

function extFromMime(mime: string, filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot >= 0) return filename.slice(dot + 1).toLowerCase();
  if (mime.startsWith("image/")) return mime.slice(6);
  if (mime.startsWith("video/")) return mime.slice(6);
  return "bin";
}

function yearMonthFromTs(ms: number | null): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

r.post("/", async (c) => {
  const form = await c.req.formData();
  const original = form.get("original");
  const thumb = form.get("thumb");
  const preview = form.get("preview");
  const metaRaw = form.get("metadata");

  const isBlob = (v: unknown): v is Blob =>
    !!v && typeof v === "object" && typeof (v as Blob).arrayBuffer === "function" && typeof (v as Blob).size === "number";

  if (!isBlob(original) || !isBlob(thumb) || !isBlob(preview)) {
    return c.json({ error: "missing_files", detail: "original, thumb, preview required" }, 400);
  }
  if (typeof metaRaw !== "string") {
    return c.json({ error: "missing_metadata" }, 400);
  }
  if (original.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: "too_large", detail: `max ${MAX_UPLOAD_BYTES} bytes` }, 413);
  }

  let meta: UploadMetadata;
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return c.json({ error: "invalid_metadata_json" }, 400);
  }

  const id = uuid();
  const ext = extFromMime(meta.mime, meta.filename);
  const origKey = `orig/${id}.${ext}`;
  const previewKey = `preview/${id}.jpg`;
  const thumbKey = `thumb/${id}.jpg`;

  await Promise.all([
    putBlob(c.env.BUCKET, origKey, original),
    putBlob(c.env.BUCKET, previewKey, preview),
    putBlob(c.env.BUCKET, thumbKey, thumb),
  ]);

  const now = Date.now();
  const photo: Photo = {
    id,
    r2_key: origKey,
    thumb_key: thumbKey,
    preview_key: previewKey,
    filename: meta.filename,
    mime: meta.mime,
    size: meta.size,
    width: meta.width,
    height: meta.height,
    duration_ms: meta.duration_ms,
    taken_at: meta.taken_at,
    uploaded_at: now,
    album_id: null,
    year_month: yearMonthFromTs(meta.taken_at ?? now),
    exif_json: meta.exif ? JSON.stringify(meta.exif) : null,
    deleted_at: null,
    updated_at: now,
  };

  try {
    await insertPhoto(c.env.DB, photo);
  } catch (e) {
    await c.env.BUCKET.delete([origKey, previewKey, thumbKey]);
    return c.json({ error: "db_insert_failed", detail: String(e) }, 500);
  }

  return c.json({ photo });
});

export default r;
