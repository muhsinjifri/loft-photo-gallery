import exifr from "exifr";
import { THUMB_PX, PREVIEW_PX, JPEG_QUALITY, type UploadMetadata } from "@loft/shared";
import { withTimeout } from "./util";

export interface PreparedUpload {
  original: Blob;
  thumb: Blob;
  preview: Blob;
  meta: UploadMetadata;
  /** Diagnostic shown in the upload sheet (which path produced the thumbnail). */
  thumbNote?: string;
}

interface VideoThumbs {
  thumb: Blob;
  preview: Blob;
  width: number;
  height: number;
  duration_ms: number;
}

async function resizeImage(file: File, maxPx: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d ctx");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
}

// Draw a frame source (VideoFrame or HTMLVideoElement) to an OffscreenCanvas,
// applying display rotation (0/90/180/270) and downscaling to maxPx on the
// long edge. When `verify` is set, throws if the canvas came out empty
// (undecoded HEVC leaves it transparent) so the caller can fall back.
async function sourceToBlob(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  rotation: number,
  maxPx: number,
  verify = false,
): Promise<Blob> {
  const rot = ((rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const dispW = swap ? srcH : srcW;
  const dispH = swap ? srcW : srcH;
  const scale = Math.min(1, maxPx / Math.max(dispW, dispH));
  const sW = Math.max(1, Math.round(srcW * scale));
  const sH = Math.max(1, Math.round(srcH * scale));
  const outW = swap ? sH : sW;
  const outH = swap ? sW : sH;

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d ctx");
  ctx.translate(outW / 2, outH / 2);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(source, -sW / 2, -sH / 2, sW, sH);

  if (verify) {
    // Only reject when the canvas is genuinely EMPTY (nothing was drawn — a
    // failed decode leaves it fully transparent). A dark-but-opaque frame is a
    // valid frame (videos that open on a black/fade-in scene), so we must NOT
    // reject on low brightness — only on zero alpha across the samples.
    const points: [number, number][] = [
      [Math.floor(outW / 2), Math.floor(outH / 2)],
      [Math.floor(outW / 4), Math.floor(outH / 4)],
      [Math.floor((3 * outW) / 4), Math.floor((3 * outH) / 4)],
      [2, 2],
      [outW - 2, outH - 2],
    ];
    let drewSomething = false;
    for (const [x, y] of points) {
      if (ctx.getImageData(x, y, 1, 1).data[3] !== 0) {
        drewSomething = true;
        break;
      }
    }
    if (!drewSomething) {
      throw new Error("decoded frame is empty (codec likely unsupported)");
    }
  }

  return canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
}

// Tier 1: WebCodecs + mp4box.js — taps the device hardware decoder. Handles
// H.264 and HEVC (iPhone .mov) where the platform supports them.
async function videoFrameViaWebCodecs(file: File): Promise<VideoThumbs> {
  const { extractVideoFrameWebCodecs } = await import("./videoFrameWebCodecs");
  const { frame, rotation, durationMs, codec, format } = await extractVideoFrameWebCodecs(file);
  try {
    const srcW = frame.displayWidth || frame.codedWidth;
    const srcH = frame.displayHeight || frame.codedHeight;
    if (!srcW || !srcH) throw new Error("decoded frame has no dimensions");

    // Draw source: a hardware VideoFrame sometimes reads back blank when drawn
    // directly to a 2D canvas (Chrome/GPU surface bug, esp. 10-bit/P010 HDR).
    // createImageBitmap forces a proper colour-converted copy, so try the
    // direct draw first and fall back to a decoded bitmap if it comes out empty.
    let drawSource: CanvasImageSource = frame;
    let thumb: Blob;
    try {
      thumb = await sourceToBlob(drawSource, srcW, srcH, rotation, THUMB_PX, true);
    } catch (drawErr) {
      console.warn(
        `[upload] direct VideoFrame draw blank (codec ${codec}, format ${format}); retrying via createImageBitmap`,
        drawErr,
      );
      const bmp = await createImageBitmap(frame);
      drawSource = bmp;
      thumb = await sourceToBlob(bmp, srcW, srcH, rotation, THUMB_PX, true);
    }
    const preview = await sourceToBlob(drawSource, srcW, srcH, rotation, PREVIEW_PX);
    if (drawSource !== frame) (drawSource as ImageBitmap).close?.();

    const swap = rotation === 90 || rotation === 270;
    return {
      thumb,
      preview,
      width: swap ? srcH : srcW,
      height: swap ? srcW : srcH,
      duration_ms: Math.round(durationMs),
    };
  } finally {
    frame.close();
  }
}

// Let a playing video advance a little before we grab a frame: skips black
// intro / fade-in frames (which would otherwise look like a blank thumbnail)
// and gives the decoder time to actually render. Resolves once playback has
// progressed past `minTime` (or a few frames in / the clip ended), capped by
// `timeoutMs`. Uses requestVideoFrameCallback when available.
function awaitPlaybackProgress(
  video: HTMLVideoElement,
  minTime = 0.2,
  timeoutMs = 6000,
): Promise<void> {
  type RVF = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
  const v = video as RVF;
  const hasRVF = typeof v.requestVideoFrameCallback === "function";
  return new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, timeoutMs);
    let frames = 0;
    const done = () => {
      window.clearTimeout(t);
      resolve();
    };
    const tick = () => {
      frames += 1;
      if (video.currentTime >= minTime || frames >= 10 || video.ended) {
        done();
        return;
      }
      if (hasRVF) v.requestVideoFrameCallback!(tick);
      else requestAnimationFrame(tick);
    };
    if (hasRVF) v.requestVideoFrameCallback!(tick);
    else requestAnimationFrame(tick);
  });
}

// Tier 2: <video> element + canvas. Handles containers mp4box can't parse and
// codecs WebCodecs stalls on. Uses muted inline PLAY + grab-first-painted-frame
// (via requestVideoFrameCallback) instead of an off-screen seek — iOS Safari
// refuses to fire `seeked` for programmatic off-screen seeks, but it does allow
// muted inline autoplay. The browser bakes rotation into videoWidth/Height and
// drawImage, so rotation is passed as 0.
async function videoFirstFrame(file: File): Promise<VideoThumbs> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  // iOS needs the element in the DOM, on-screen-ish, and not display:none /
  // fully transparent or it won't decode. 1px, nearly-invisible, behind content.
  video.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;";
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  document.body.appendChild(video);

  try {
    video.src = url;

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
        video.addEventListener(
          "error",
          () => reject(new Error(`video load failed (${video.error?.message ?? "unknown"})`)),
          { once: true },
        );
      }),
      12000,
      "video metadata load",
    );

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("video has no decodable dimensions");
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

    // Play (muted inline is allowed without a gesture) to force the decoder to
    // render frames, let it advance slightly past any black intro, then capture.
    const target = duration > 0 ? Math.min(0.2, duration / 4) : 0.2;
    await withTimeout(
      (async () => {
        try {
          const playP = video.play();
          if (playP && typeof playP.then === "function") await playP;
        } catch (e) {
          throw new Error(`video play rejected (${e instanceof Error ? e.message : e})`);
        }
        await awaitPlaybackProgress(video, target, 6000);
      })(),
      9000,
      "video play+frame",
    );

    const thumb = await sourceToBlob(video, video.videoWidth, video.videoHeight, 0, THUMB_PX, true);
    const preview = await sourceToBlob(video, video.videoWidth, video.videoHeight, 0, PREVIEW_PX);
    try {
      video.pause();
    } catch {
      /* noop */
    }
    return {
      thumb,
      preview,
      width: video.videoWidth,
      height: video.videoHeight,
      duration_ms: Math.round(duration * 1000),
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    video.remove();
  }
}

// Tier 3: generated film-icon placeholder when no real frame can be produced.
async function placeholderVideoThumb(size: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d ctx");
  ctx.fillStyle = "#EDE5D6";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#6B8266";
  ctx.lineWidth = Math.max(1, size / 60);
  const m = size * 0.18;
  ctx.strokeRect(m, m, size - 2 * m, size - 2 * m);
  ctx.fillStyle = "#6B8266";
  ctx.beginPath();
  const cx = size / 2;
  const cy = size / 2;
  const tri = size * 0.12;
  ctx.moveTo(cx - tri / 2, cy - tri);
  ctx.lineTo(cx + tri, cy);
  ctx.lineTo(cx - tri / 2, cy + tri);
  ctx.closePath();
  ctx.fill();
  return canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
}

export interface VideoThumbResult extends VideoThumbs {
  note: string;
  /** true only when a real decoded frame was produced (not the placeholder). */
  real: boolean;
}

// Reusable 3-tier video thumbnail generation. Works on a File or a Blob (the
// backfill passes a Blob fetched from R2). `name` is only used for logging.
export async function generateVideoThumbnails(
  file: Blob,
  name = "video",
): Promise<VideoThumbResult> {
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const asFile = file instanceof File ? file : new File([file], name, { type: file.type });

  // Tier 1: WebCodecs (HEVC + H.264 via hardware decoder)
  let webcodecsErr = "";
  try {
    const r = await videoFrameViaWebCodecs(asFile);
    return { ...r, note: "thumbnail via WebCodecs", real: true };
  } catch (e) {
    webcodecsErr = errMsg(e);
    console.warn(`[upload] WebCodecs extraction failed for "${name}", trying <video>`, e);
  }
  // Tier 2: <video> element (other containers / codecs / iOS)
  let videoErr = "";
  try {
    const r = await videoFirstFrame(asFile);
    return { ...r, note: `thumbnail via <video> (webcodecs: ${webcodecsErr})`, real: true };
  } catch (e) {
    videoErr = errMsg(e);
    console.warn(`[upload] <video> extraction failed for "${name}", using placeholder`, e);
  }
  // Tier 3: placeholder. Keep the technical detail in the console; show the
  // user a short, non-alarming note.
  console.warn(
    `[upload] placeholder for "${name}" — webcodecs: ${webcodecsErr}; <video>: ${videoErr}`,
  );
  const [thumb, preview] = await Promise.all([
    placeholderVideoThumb(THUMB_PX),
    placeholderVideoThumb(PREVIEW_PX),
  ]);
  return {
    thumb,
    preview,
    width: 0,
    height: 0,
    duration_ms: 0,
    note: "couldn't read a frame on this device — placeholder shown (will retry on desktop)",
    real: false,
  };
}

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (file.type.startsWith("image/")) {
    const [thumb, preview, exif] = await Promise.all([
      resizeImage(file, THUMB_PX),
      resizeImage(file, PREVIEW_PX),
      exifr.parse(file, { gps: true }).catch(() => null),
    ]);
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    const taken = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;
    const taken_at = taken instanceof Date ? taken.getTime() : null;
    return {
      original: file,
      thumb,
      preview,
      meta: {
        filename: file.name,
        mime: file.type,
        size: file.size,
        width,
        height,
        duration_ms: null,
        taken_at,
        exif: exif as Record<string, unknown> | null,
      },
    };
  }

  if (file.type.startsWith("video/")) {
    const { thumb, preview, width, height, duration_ms, note, real } =
      await generateVideoThumbnails(file, file.name);
    return {
      original: file,
      thumb,
      preview,
      // Only surface a note when we fell back to the placeholder; a successful
      // real thumbnail (via WebCodecs or <video>) needs no message.
      thumbNote: real ? undefined : note,
      meta: {
        filename: file.name,
        mime: file.type,
        size: file.size,
        width: width || null,
        height: height || null,
        duration_ms: duration_ms || null,
        taken_at: file.lastModified || null,
        exif: null,
      },
    };
  }

  throw new Error(`unsupported file type: ${file.type}`);
}
