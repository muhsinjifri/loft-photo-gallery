import type { Photo, Album, SyncResponse, UploadMetadata, MeResponse, Scope } from "@loft/shared";

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Registered by UserProvider rather than importing the router here, so this
// module stays free of React.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

/**
 * Dev-only identity override. The Worker reads this from the `loft_dev_user`
 * cookie so that <img src="/img/..."> switches identity too — an <img> cannot
 * carry a custom header, so a header-only scheme would leave every thumbnail
 * 404ing the moment you switched user. The header below is a convenience for
 * fetch calls; the cookie is what makes the whole app agree.
 */
export const DEV_USER_COOKIE = "loft_dev_user";

export function getDevUser(): string | null {
  if (!import.meta.env.DEV) return null;
  const m = document.cookie.match(/(?:^|;\s*)loft_dev_user=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function setDevUser(v: string | null): void {
  if (!import.meta.env.DEV) return;
  document.cookie = v
    ? `${DEV_USER_COOKIE}=${encodeURIComponent(v)}; path=/; max-age=31536000; SameSite=Lax`
    : `${DEV_USER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

function devHeaders(): Record<string, string> {
  const u = getDevUser();
  return u ? { "X-Dev-User": u } : {};
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // `no-store` is essential for the API: iOS Safari otherwise serves stale
  // cached GET responses (e.g. /api/sync), so changes made in another browser
  // never appear after a refresh.
  const r = await fetch(`${BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
    // After ...init so a caller's headers merge rather than being clobbered.
    headers: { ...devHeaders(), ...((init?.headers as Record<string, string>) ?? {}) },
  });
  // 401 only: 403 means "you can see it but may not do that" (e.g. deleting the
  // partner's photo), which is not a reason to leave the app.
  if (r.status === 401) {
    onUnauthorized?.();
    throw new ApiError(r.status, `${r.status} ${r.statusText}`);
  }
  if (!r.ok) throw new ApiError(r.status, `${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export const api = {
  me: () => jsonFetch<MeResponse>(`/api/me`),
  updateMe: (display_name: string) =>
    jsonFetch<MeResponse>(`/api/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name }),
    }),
  sync: (since: number) =>
    jsonFetch<SyncResponse>(`/api/sync?since=${since}`),
  listPhotos: (params: {
    album_id?: string;
    year_month?: string;
    trash?: boolean;
    cursor?: string;
    scope?: Scope;
  }) => {
    const q = new URLSearchParams();
    if (params.album_id) q.set("album_id", params.album_id);
    if (params.year_month) q.set("year_month", params.year_month);
    if (params.trash) q.set("trash", "1");
    if (params.scope) q.set("scope", params.scope);
    if (params.cursor) q.set("cursor", params.cursor);
    return jsonFetch<{ photos: Photo[]; next_cursor: string | null }>(`/api/photos?${q}`);
  },
  deletePhoto: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/photos/${id}`, { method: "DELETE" }),
  restorePhoto: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/photos/${id}/restore`, { method: "POST" }),
  /** File many photos at once. Owner-scoped server-side: photos that aren't yours are skipped. */
  setAlbumBulk: (photo_ids: string[], album_id: string | null) =>
    jsonFetch<{ photos: Photo[]; updated: number; requested: number }>(`/api/photos/album`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_ids, album_id }),
    }),
  setAlbum: (id: string, album_id: string | null) =>
    jsonFetch<{ ok: true }>(`/api/photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ album_id }),
    }),
  replaceThumbnail: (
    id: string,
    thumb: Blob,
    preview: Blob,
    meta: {
      width: number | null;
      height: number | null;
      duration_ms: number | null;
      /** Fills a missing date only (Shortcut pushes arrive undated). */
      taken_at?: number | null;
      exif?: Record<string, unknown> | null;
    },
  ) => {
    const fd = new FormData();
    fd.append("thumb", thumb, "thumb.jpg");
    fd.append("preview", preview, "preview.jpg");
    fd.append("metadata", JSON.stringify(meta));
    return jsonFetch<{ photo: Photo }>(`/api/photos/${id}/thumbnail`, { method: "POST", body: fd });
  },
  uploadKey: () =>
    jsonFetch<{ exists: boolean; created_at: number | null; last_used_at: number | null }>(`/api/upload-key`),
  /** Replaces any existing key. The returned token is shown once and never retrievable again. */
  createUploadKey: () => jsonFetch<{ token: string }>(`/api/upload-key`, { method: "POST" }),
  revokeUploadKey: () => jsonFetch<{ ok: true }>(`/api/upload-key`, { method: "DELETE" }),
  logout: () => fetch(`${BASE}/logout`, { method: "POST", credentials: "include", cache: "no-store" }),
  listAlbums: () => jsonFetch<{ albums: Album[] }>(`/api/albums`),
  createAlbum: (name: string, is_shared = false) =>
    jsonFetch<{ album: Album }>(`/api/albums`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, is_shared }),
    }),
  /** Deletes the album only — the pictures in it are unfiled, never deleted. */
  deleteAlbum: (id: string) => jsonFetch<{ ok: true }>(`/api/albums/${id}`, { method: "DELETE" }),
  updateAlbum: (id: string, patch: { name?: string; is_shared?: boolean; cover_photo_id?: string | null }) =>
    jsonFetch<{ album: Album }>(`/api/albums/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  upload: (
    original: Blob,
    thumb: Blob,
    preview: Blob,
    meta: UploadMetadata,
    onProgress?: (fraction: number) => void,
  ): Promise<{ photo: Photo }> => {
    const fd = new FormData();
    fd.append("original", original, meta.filename);
    fd.append("thumb", thumb, "thumb.jpg");
    fd.append("preview", preview, "preview.jpg");
    fd.append("metadata", JSON.stringify(meta));
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/api/upload`);
      xhr.withCredentials = true;
      const dev = getDevUser();
      if (dev) xhr.setRequestHeader("X-Dev-User", dev); // must come after open()
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        } else {
          if (xhr.status === 401) onUnauthorized?.();
          reject(new ApiError(xhr.status, `${xhr.status} ${xhr.statusText || "upload failed"}`));
        }
      };
      xhr.onerror = () => reject(new Error("network error during upload"));
      xhr.ontimeout = () => reject(new Error("upload timed out"));
      xhr.send(fd);
    });
  },
};

// Cache-bust version for a photo's thumb/preview URL. Returns a value ONLY when
// the stored media was actually regenerated (a backfilled video thumbnail), so
// normal photos keep a stable URL that hits the edge + service-worker caches.
//
// This deliberately does NOT key off updated_at. That field bumps on every
// metadata change — filing into an album, delete, restore, and the share bump
// that touches every photo in an album at once — and versioning on it silently
// re-downloaded pictures whose pixels had not changed.
export function cacheVer(p: { media_updated_at: number | null }): number | undefined {
  return p.media_updated_at ?? undefined;
}

export const imgUrl = {
  thumb: (id: string, v?: number | null) => `${BASE}/img/thumb/${id}${v ? `?v=${v}` : ""}`,
  preview: (id: string, v?: number | null) => `${BASE}/img/preview/${id}${v ? `?v=${v}` : ""}`,
  orig: (id: string) => `${BASE}/img/orig/${id}`,
};
