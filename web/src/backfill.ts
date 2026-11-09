import { db, getMeta, setMeta, CURRENT_USER_KEY } from "./db";
import { api, imgUrl } from "./api";
import { generateVideoThumbnails, prepareUpload } from "./thumb";

const SKIP_KEY_BASE = "backfill_skip";

/** Namespaced per identity — the skip list is about this person's own items. */
export async function skipKey(): Promise<string> {
  return `${SKIP_KEY_BASE}:${(await getMeta(CURRENT_USER_KEY)) ?? "unknown"}`;
}

export interface BackfillProgress {
  done: number;
  total: number;
  current?: string;
  fixed: number;
  failed: number;
}

export interface BackfillResult {
  fixed: number;
  failed: number;
  total: number;
}

let running = false;

async function loadSkip(): Promise<Set<string>> {
  const raw = await getMeta(await skipKey());
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function saveSkip(skip: Set<string>): Promise<void> {
  await setMeta(await skipKey(), JSON.stringify([...skip]));
}

/**
 * Things I OWN still showing a placeholder thumbnail — unknown dimensions is the
 * marker. That covers videos whose frame couldn't be decoded at upload, and
 * anything pushed in from an Apple Shortcut (which can't make thumbnails at all).
 * Scoped to the owner because this feeds api.replaceThumbnail, which is
 * owner-only — unscoped it would 403 on every one of the partner's items.
 */
async function findPlaceholders(kind: "video" | "image") {
  const meId = await getMeta(CURRENT_USER_KEY);
  if (!meId) return [];
  const mine = await db.photos.where("owner_id").equals(meId).toArray();
  return mine.filter(
    (p) => !p.deleted_at && p.mime.startsWith(`${kind}/`) && (!p.width || !p.height),
  );
}

export async function countPlaceholderVideos(): Promise<number> {
  return (await findPlaceholders("video")).length;
}

async function fetchOriginal(p: { id: string; mime: string; filename: string }): Promise<File> {
  const resp = await fetch(imgUrl.orig(p.id), { credentials: "include" });
  if (!resp.ok) throw new Error(`fetch original ${resp.status}`);
  return new File([await resp.blob()], p.filename, { type: p.mime });
}

/**
 * Make real thumbnails for pictures pushed from a Shortcut, and pick up their
 * EXIF date so they move to the right month. Same resize path as a normal
 * upload. HEIC only decodes in Safari, so elsewhere those are recorded as skips
 * and left for the phone.
 */
export async function backfillImageThumbnails(opts?: { limit?: number }): Promise<BackfillResult> {
  if (running) return { fixed: 0, failed: 0, total: 0 };
  running = true;
  try {
    const skip = await loadSkip();
    const candidates = (await findPlaceholders("image")).filter((p) => !skip.has(p.id));
    const work = candidates.slice(0, opts?.limit ?? candidates.length);
    let fixed = 0;
    let failed = 0;
    for (const p of work) {
      let file: File;
      try {
        file = await fetchOriginal(p);
      } catch (e) {
        // Network trouble — not this browser's fault, so try again next time.
        console.warn(`[backfill] couldn't fetch "${p.filename}"`, e);
        failed++;
        continue;
      }
      try {
        const prepared = await prepareUpload(file);
        const { photo } = await api.replaceThumbnail(p.id, prepared.thumb, prepared.preview, {
          width: prepared.meta.width,
          height: prepared.meta.height,
          duration_ms: null,
          taken_at: prepared.meta.taken_at,
          exif: prepared.meta.exif,
        });
        await db.photos.put(photo);
        skip.delete(p.id);
        fixed++;
      } catch (e) {
        // Couldn't decode here (HEIC outside Safari) — don't re-download it every run.
        console.warn(`[backfill] couldn't make a thumbnail for "${p.filename}" here`, e);
        skip.add(p.id);
        failed++;
      }
    }
    await saveSkip(skip);
    return { fixed, failed, total: work.length };
  } finally {
    running = false;
  }
}

/**
 * Regenerate real thumbnails for videos stored with a placeholder. Runs the
 * normal client decode pipeline (WebCodecs / <video>) on the original fetched
 * from R2, then replaces the stored thumb/preview. Only effective on browsers
 * that can actually decode (desktop); on others it records skips so it won't
 * re-download originals every run.
 */
export async function backfillVideoThumbnails(opts?: {
  limit?: number;
  ignoreSkip?: boolean;
  onProgress?: (p: BackfillProgress) => void;
}): Promise<BackfillResult> {
  if (running) return { fixed: 0, failed: 0, total: 0 };
  running = true;
  try {
    const skip = await loadSkip();
    let candidates = await findPlaceholders("video");
    if (!opts?.ignoreSkip) candidates = candidates.filter((p) => !skip.has(p.id));
    const work = candidates.slice(0, opts?.limit ?? candidates.length);

    let fixed = 0;
    let failed = 0;
    for (let i = 0; i < work.length; i++) {
      const p = work[i];
      opts?.onProgress?.({ done: i, total: work.length, current: p.filename, fixed, failed });
      try {
        const blob = await fetchOriginal(p);
        const r = await generateVideoThumbnails(blob, p.filename);
        if (!r.real) {
          // This browser couldn't decode it either — remember so we don't
          // keep re-downloading the original on every run.
          skip.add(p.id);
          failed++;
          continue;
        }
        const { photo } = await api.replaceThumbnail(p.id, r.thumb, r.preview, {
          width: r.width,
          height: r.height,
          duration_ms: r.duration_ms,
        });
        await db.photos.put(photo);
        skip.delete(p.id);
        fixed++;
      } catch (e) {
        console.warn(`[backfill] failed for "${p.filename}"`, e);
        failed++;
      }
    }
    await saveSkip(skip);
    opts?.onProgress?.({ done: work.length, total: work.length, fixed, failed });
    return { fixed, failed, total: work.length };
  } finally {
    running = false;
  }
}

/** Heuristic: desktop browsers decode video reliably; skip auto-run on touch (iOS). */
function looksLikeDesktop(): boolean {
  return typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) === 0;
}

/**
 * Fire-and-forget auto-backfill. Shortcut-pushed pictures are done on any device
 * (the phone is usually the one that can decode HEIC); videos only on capable
 * desktop browsers. Each is capped so a big batch doesn't hog one session.
 */
export function autoBackfill(): void {
  void backfillImageThumbnails({ limit: 40 })
    .then((r) => {
      if (r.fixed) console.info(`[backfill] made ${r.fixed} thumbnail(s) for pushed pictures`);
    })
    .catch(console.error)
    .finally(autoBackfillVideos);
}

function autoBackfillVideos(): void {
  if (!looksLikeDesktop()) return;
  if (typeof VideoDecoder === "undefined" && typeof document.createElement("video").canPlayType !== "function")
    return;
  // Small batch so a large library doesn't hammer bandwidth in one session.
  void backfillVideoThumbnails({ limit: 12 }).then((r) => {
    if (r.fixed) console.info(`[backfill] regenerated ${r.fixed} video thumbnail(s)`);
  });
}
