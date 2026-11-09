import { Hono } from "hono";
import type { Env, AppVariables, UserRow } from "../env";
import { allowedEmails } from "../env";
import type { Photo } from "@loft/shared";
import { MAX_UPLOAD_BYTES } from "@loft/shared";
import { putBlob } from "../lib/r2";
import { insertPhoto } from "../lib/db";
import { findOwnerByToken, touchUploadKey } from "../lib/uploadKeys";
import { extForMime, extFromMime, guessMime, PLACEHOLDER_SVG, yearMonthFromTs } from "../lib/media";

/**
 * POST /api/push — add one photo or video from an Apple Shortcut.
 *
 * Authenticated by a personal upload key (`Authorization: Bearer loft_…`), NOT by
 * the session cookie, so it is mounted outside the `auth` middleware. A key can
 * only add pictures to its owner's library — it grants nothing else.
 *
 * Body, either:
 *   - multipart/form-data with a `file` field (what Shortcuts' "Form" body sends),
 *     plus an optional `taken_at` field (ISO 8601 or epoch ms); or
 *   - the raw file, with optional `?filename=` and `?taken_at=`.
 *
 * The Shortcut can't make the small derivatives, so a placeholder is stored and
 * the app swaps in the real thumbnail (and the EXIF date) the next time it opens.
 */
const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const isBlob = (v: unknown): v is Blob =>
  !!v && typeof v === "object" && typeof (v as Blob).arrayBuffer === "function" && typeof (v as Blob).size === "number";

function parseTakenAt(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  const n = /^\d+$/.test(s) ? Number(s) : Date.parse(s);
  // Reject nonsense rather than filing a picture in 1970.
  return Number.isFinite(n) && n > Date.UTC(1990, 0, 1) && n < Date.now() + 86_400_000 ? n : null;
}

r.post("/", async (c) => {
  const m = /^Bearer\s+(\S+)$/i.exec(c.req.header("Authorization") ?? "");
  if (!m) return c.json({ error: "unauthorized", detail: "missing upload key" }, 401);
  const ownerId = await findOwnerByToken(c.env.DB, m[1]);
  if (!ownerId) return c.json({ error: "unauthorized", detail: "unknown upload key" }, 401);

  // A key outlives nothing: if its owner was removed from ALLOWED_EMAILS, it stops.
  const owner = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(ownerId).first<UserRow>();
  if (!owner || !allowedEmails(c.env).includes(owner.email)) return c.json({ error: "unauthorized" }, 401);

  const declaredLen = Number(c.req.header("Content-Length") ?? 0);
  if (declaredLen > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return c.json({ error: "too_large", detail: `max ${MAX_UPLOAD_BYTES} bytes` }, 413);
  }

  let file: Blob;
  let filename = "";
  let takenAt: number | null;
  const ct = c.req.header("Content-Type") ?? "";
  if (ct.startsWith("multipart/form-data")) {
    const form = await c.req.formData();
    let f: unknown = form.get("file");
    if (!isBlob(f)) f = [...form.values()].find(isBlob);
    if (!isBlob(f)) return c.json({ error: "missing_file", detail: "send the picture in a `file` field" }, 400);
    file = f;
    filename = (f as Blob & { name?: string }).name ?? "";
    takenAt = parseTakenAt(form.get("taken_at"));
  } else {
    file = await c.req.blob();
    filename = c.req.query("filename") ?? "";
    takenAt = parseTakenAt(c.req.query("taken_at"));
  }

  if (file.size === 0) return c.json({ error: "empty_file" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "too_large", detail: `max ${MAX_UPLOAD_BYTES} bytes` }, 413);

  const mime = guessMime(file.type || ct, filename);
  if (!mime) return c.json({ error: "unsupported_type", detail: "only photos and videos" }, 415);
  if (!filename) filename = `shortcut-${new Date().toISOString().replace(/[:.]/g, "-")}.${extForMime(mime)}`;

  const id = crypto.randomUUID();
  const prefix = `u/${owner.id}`;
  const origKey = `${prefix}/orig/${id}.${extFromMime(mime, filename)}`;
  // Placeholder SVG under a .jpg key for now: the backfill later overwrites these
  // keys with JPEG bytes, and the stored Content-Type — not the extension — is
  // what /img serves.
  const previewKey = `${prefix}/preview/${id}.jpg`;
  const thumbKey = `${prefix}/thumb/${id}.jpg`;
  const placeholder = new Blob([PLACEHOLDER_SVG], { type: "image/svg+xml" });

  await Promise.all([
    putBlob(c.env.BUCKET, origKey, new Blob([file], { type: mime })),
    putBlob(c.env.BUCKET, previewKey, placeholder),
    putBlob(c.env.BUCKET, thumbKey, placeholder),
  ]);

  const now = Date.now();
  const photo: Photo = {
    id,
    r2_key: origKey,
    thumb_key: thumbKey,
    preview_key: previewKey,
    filename,
    mime,
    size: file.size,
    // Unknown dimensions are the "still needs a real thumbnail" marker the
    // client backfill looks for.
    width: null,
    height: null,
    duration_ms: null,
    taken_at: takenAt,
    uploaded_at: now,
    album_id: null,
    year_month: yearMonthFromTs(takenAt ?? now),
    exif_json: null,
    deleted_at: null,
    updated_at: now,
    media_updated_at: null,
    owner_id: owner.id,
  };

  try {
    await insertPhoto(c.env.DB, photo);
  } catch (e) {
    await c.env.BUCKET.delete([origKey, previewKey, thumbKey]);
    return c.json({ error: "db_insert_failed", detail: String(e) }, 500);
  }
  c.executionCtx.waitUntil(touchUploadKey(c.env.DB, owner.id));

  return c.json({ ok: true, id, filename });
});

export default r;
