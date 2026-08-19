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
  /** Last time ANY field on the row changed. Drives delta sync — not cache busting. */
  updated_at: number | null;
  /**
   * Last time the thumb/preview blobs were actually rewritten. This — not
   * updated_at — is the cache-bust version for image URLs, so that filing a
   * photo into an album or sharing that album doesn't re-download the picture.
   */
  media_updated_at: number | null;
  /** users.id of the uploader. Only the owner may delete, move, or re-thumbnail. */
  owner_id: string;
}

export interface Album {
  id: string;
  name: string;
  cover_photo_id: string | null;
  created_at: number;
  owner_id: string;
  /**
   * SQLite boolean. Kept as 0|1 end to end so no row mapper is needed between D1
   * and the wire — this type is also the Dexie row type.
   */
  is_shared: 0 | 1;
  updated_at: number | null;
}

export const isShared = (a: Album): boolean => a.is_shared === 1;

export interface PublicUser {
  id: string;
  display_name: string;
}

export interface Me extends PublicUser {
  email: string;
}

/** Whose pictures a timeline view shows. "ours" = photos in shared albums, from either person. */
export type Scope = "mine" | "ours";

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
  /** Delta since `since`, filtered to what the viewer may see. */
  photos: Photo[];
  /**
   * The AUTHORITATIVE, COMPLETE set of albums visible to the viewer — not a delta.
   * The client must replace its album table with this rather than merging into it,
   * which is what makes renames and un-shares propagate.
   */
  albums: Album[];
  /**
   * Ids of photos that changed since `since` and are no longer visible to the
   * viewer — e.g. the owner moved them out of a shared album, or un-shared it.
   * Computed on the fly; there is no tombstone table.
   */
  removed_photo_ids: string[];
  server_time: number;
}

export interface MeResponse {
  me: Me;
  /** Everyone configured in ALLOWED_EMAILS, for "added by …" labels. No emails. */
  users: PublicUser[];
}

export interface AlbumResponse {
  album: Album;
}

export interface AlbumPatchBody {
  name?: string;
  is_shared?: boolean;
  cover_photo_id?: string | null;
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
