export interface Photo {
  id: string;
  r2_key: string;
  thumb_key: string;
  preview_key: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  taken_at: number | null;
  uploaded_at: number;
  album_id: string | null;
  year_month: string | null;
  exif_json: string | null;
  deleted_at: number | null;
  /** Last time the row's media/metadata changed; also used as a cache-bust version for thumb/preview URLs. */
  updated_at: number | null;
}

export interface Album {
  id: string;
  name: string;
  cover_photo_id: string | null;
  created_at: number;
}

export interface UploadMetadata {
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  taken_at: number | null;
  exif: Record<string, unknown> | null;
}

export interface PhotoListResponse {
  photos: Photo[];
  next_cursor: string | null;
}

export interface SyncResponse {
  photos: Photo[];
  albums: Album[];
  server_time: number;
}

export interface ApiError {
  error: string;
  detail?: string;
}

export type PhotoKind = "thumb" | "preview" | "orig";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const THUMB_PX = 512;
export const PREVIEW_PX = 2048;
export const JPEG_QUALITY = 0.92;
