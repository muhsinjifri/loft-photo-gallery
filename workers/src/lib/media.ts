export function extFromMime(mime: string, filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot >= 0) return filename.slice(dot + 1).toLowerCase();
  if (mime.startsWith("image/")) return mime.slice(6);
  if (mime.startsWith("video/")) return mime.slice(6);
  return "bin";
}

export function yearMonthFromTs(ms: number | null): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  dng: "image/x-adobe-dng",
  mov: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
};

/** Shortcuts often sends `application/octet-stream`; fall back to the file extension. */
export function guessMime(declared: string | null | undefined, filename: string): string | null {
  const d = (declared ?? "").split(";")[0].trim().toLowerCase();
  if (d.startsWith("image/") || d.startsWith("video/")) return d;
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? (MIME_BY_EXT[filename.slice(dot + 1).toLowerCase()] ?? null) : null;
}

const EXT_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext]),
);

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? mime.split("/")[1] ?? "bin";
}

/**
 * Stand-in thumb/preview for media that arrived without one (Shortcut pushes).
 * The app replaces it with a real frame the next time it is opened on a device
 * that can decode the original — the same placeholder→backfill path videos use.
 */
export const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#8E8E93" fill-opacity="0.18"/><g fill="none" stroke="#8E8E93" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"><rect x="130" y="145" width="140" height="110" rx="14"/><circle cx="170" cy="182" r="12"/><path d="M135 245l45-40 30 25 25-20 35 35"/></g></svg>`;
