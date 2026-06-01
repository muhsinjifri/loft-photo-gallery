import type { Photo, Album, SyncResponse, UploadMetadata } from "@loft/shared";

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // `no-store` is essential for the API: iOS Safari otherwise serves stale
  // cached GET responses (e.g. /api/sync), so changes made in another browser
  // never appear after a refresh.
  const r = await fetch(`${BASE}${path}`, { credentials: "include", cache: "no-store", ...init });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export const api = {
  sync: (since: number) =>
    jsonFetch<SyncResponse>(`/api/sync?since=${since}`),
  listPhotos: (params: { album_id?: string; year_month?: string; trash?: boolean; cursor?: string }) => {
    const q = new URLSearchParams();
    if (params.album_id) q.set("album_id", params.album_id);
    if (params.year_month) q.set("year_month", params.year_month);
    if (params.trash) q.set("trash", "1");
    if (params.cursor) q.set("cursor", params.cursor);
    return jsonFetch<{ photos: Photo[]; next_cursor: string | null }>(`/api/photos?${q}`);
  },
  deletePhoto: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/photos/${id}`, { method: "DELETE" }),
  restorePhoto: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/photos/${id}/restore`, { method: "POST" }),
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
    meta: { width: number | null; height: number | null; duration_ms: number | null },
  ) => {
    const fd = new FormData();
    fd.append("thumb", thumb, "thumb.jpg");
    fd.append("preview", preview, "preview.jpg");
    fd.append("metadata", JSON.stringify(meta));
    return jsonFetch<{ photo: Photo }>(`/api/photos/${id}/thumbnail`, { method: "POST", body: fd });
  },
  listAlbums: () => jsonFetch<{ albums: Album[] }>(`/api/albums`),
  createAlbum: (name: string) =>
    jsonFetch<{ album: Album }>(`/api/albums`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
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
          reject(new Error(`${xhr.status} ${xhr.statusText || "upload failed"}`));
        }
      };
      xhr.onerror = () => reject(new Error("network error during upload"));
      xhr.ontimeout = () => reject(new Error("upload timed out"));
      xhr.send(fd);
    });
  },
};

// Cache-bust version for a photo's thumb/preview URL. Returns a value ONLY when
// the media was regenerated after upload (updated_at > uploaded_at, i.e. a
// backfilled thumbnail). For normal photos this is undefined so their URLs stay
// stable and keep hitting the edge + service-worker caches — appending a version
// to every photo would bust the whole on-device image cache on each sync.
export function cacheVer(p: { updated_at: number | null; uploaded_at: number }): number | undefined {
  return p.updated_at && p.updated_at > p.uploaded_at ? p.updated_at : undefined;
}

export const imgUrl = {
  thumb: (id: string, v?: number | null) => `${BASE}/img/thumb/${id}${v ? `?v=${v}` : ""}`,
  preview: (id: string, v?: number | null) => `${BASE}/img/preview/${id}${v ? `?v=${v}` : ""}`,
  orig: (id: string) => `${BASE}/img/orig/${id}`,
};
