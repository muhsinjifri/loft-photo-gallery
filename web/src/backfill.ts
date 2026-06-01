import { db, getMeta, setMeta } from "./db";
import { api, imgUrl } from "./api";
import { generateVideoThumbnails } from "./thumb";

const SKIP_KEY = "backfill_skip";

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
  const raw = await getMeta(SKIP_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function saveSkip(skip: Set<string>): Promise<void> {
  await setMeta(SKIP_KEY, JSON.stringify([...skip]));
}

/** Videos still showing a placeholder thumbnail (no real decoded dimensions). */
async function findPlaceholderVideos() {
  const all = await db.photos.toArray();
  return all.filter(
    (p) => !p.deleted_at && p.mime.startsWith("video/") && (!p.width || !p.height),
  );
}

export async function countPlaceholderVideos(): Promise<number> {
  return (await findPlaceholderVideos()).length;
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
    let candidates = await findPlaceholderVideos();
    if (!opts?.ignoreSkip) candidates = candidates.filter((p) => !skip.has(p.id));
    const work = candidates.slice(0, opts?.limit ?? candidates.length);

    let fixed = 0;
    let failed = 0;
    for (let i = 0; i < work.length; i++) {
      const p = work[i];
      opts?.onProgress?.({ done: i, total: work.length, current: p.filename, fixed, failed });
      try {
        const resp = await fetch(imgUrl.orig(p.id), { credentials: "include" });
        if (!resp.ok) throw new Error(`fetch original ${resp.status}`);
        const blob = new Blob([await resp.blob()], { type: p.mime });
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

/** Fire-and-forget auto-backfill, capped, only on capable desktop browsers. */
export function autoBackfill(): void {
  if (!looksLikeDesktop()) return;
  if (typeof VideoDecoder === "undefined" && typeof document.createElement("video").canPlayType !== "function")
    return;
  // Small batch so a large library doesn't hammer bandwidth in one session.
  void backfillVideoThumbnails({ limit: 12 }).then((r) => {
    if (r.fixed) console.info(`[backfill] regenerated ${r.fixed} video thumbnail(s)`);
  });
}
