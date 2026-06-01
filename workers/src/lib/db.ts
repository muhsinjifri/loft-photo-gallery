import type { Photo, Album } from "@loft/shared";

export async function insertPhoto(db: D1Database, p: Photo): Promise<void> {
  await db
    .prepare(
      `INSERT INTO photos
       (id, r2_key, thumb_key, preview_key, filename, mime, size, width, height,
        duration_ms, taken_at, uploaded_at, album_id, year_month, exif_json, deleted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      p.id,
      p.r2_key,
      p.thumb_key,
      p.preview_key,
      p.filename,
      p.mime,
      p.size,
      p.width,
      p.height,
      p.duration_ms,
      p.taken_at,
      p.uploaded_at,
      p.album_id,
      p.year_month,
      p.exif_json,
      p.deleted_at,
      p.updated_at ?? p.uploaded_at,
    )
    .run();
}

export async function updatePhotoThumbMeta(
  db: D1Database,
  id: string,
  m: { width: number | null; height: number | null; duration_ms: number | null; updated_at: number },
): Promise<void> {
  await db
    .prepare("UPDATE photos SET width = ?, height = ?, duration_ms = ?, updated_at = ? WHERE id = ?")
    .bind(m.width, m.height, m.duration_ms, m.updated_at, id)
    .run();
}

export interface ListFilter {
  cursor?: string | null;
  limit: number;
  album_id?: string | null;
  year_month?: string | null;
  trash?: boolean;
}

export async function listPhotos(db: D1Database, f: ListFilter): Promise<Photo[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  where.push(f.trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL");
  if (f.album_id) {
    where.push("album_id = ?");
    binds.push(f.album_id);
  }
  if (f.year_month) {
    where.push("year_month = ?");
    binds.push(f.year_month);
  }
  if (f.cursor) {
    where.push("COALESCE(taken_at, uploaded_at) < ?");
    binds.push(Number(f.cursor));
  }
  const sql = `SELECT * FROM photos WHERE ${where.join(" AND ")}
               ORDER BY COALESCE(taken_at, uploaded_at) DESC LIMIT ?`;
  binds.push(f.limit);
  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<Photo>();
  return res.results ?? [];
}

export async function getPhoto(db: D1Database, id: string): Promise<Photo | null> {
  return await db.prepare("SELECT * FROM photos WHERE id = ?").bind(id).first<Photo>();
}

export async function softDeletePhoto(db: D1Database, id: string, now: number): Promise<void> {
  await db.prepare("UPDATE photos SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").bind(now, id).run();
}

export async function restorePhoto(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE photos SET deleted_at = NULL WHERE id = ?").bind(id).run();
}

export async function updatePhotoAlbum(db: D1Database, id: string, albumId: string | null): Promise<void> {
  // Bump updated_at so the album change propagates to other devices via sync.
  await db
    .prepare("UPDATE photos SET album_id = ?, updated_at = ? WHERE id = ?")
    .bind(albumId, Date.now(), id)
    .run();
}

export async function hardDeletePhotos(db: D1Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.prepare(`DELETE FROM photos WHERE id IN (${placeholders})`).bind(...ids).run();
}

export async function findExpiredDeletes(db: D1Database, cutoffMs: number): Promise<Photo[]> {
  const res = await db
    .prepare("SELECT * FROM photos WHERE deleted_at IS NOT NULL AND deleted_at < ?")
    .bind(cutoffMs)
    .all<Photo>();
  return res.results ?? [];
}

export async function listAlbums(db: D1Database): Promise<Album[]> {
  const res = await db.prepare("SELECT * FROM albums ORDER BY created_at DESC").all<Album>();
  return res.results ?? [];
}

export async function insertAlbum(db: D1Database, a: Album): Promise<void> {
  await db
    .prepare("INSERT INTO albums (id, name, cover_photo_id, created_at) VALUES (?, ?, ?, ?)")
    .bind(a.id, a.name, a.cover_photo_id, a.created_at)
    .run();
}

export async function changedSince(
  db: D1Database,
  sinceMs: number,
): Promise<{ photos: Photo[]; albums: Album[] }> {
  const photos = await db
    .prepare(
      "SELECT * FROM photos WHERE uploaded_at > ? OR COALESCE(deleted_at, 0) > ? OR COALESCE(updated_at, 0) > ?",
    )
    .bind(sinceMs, sinceMs, sinceMs)
    .all<Photo>();
  const albums = await db.prepare("SELECT * FROM albums WHERE created_at > ?").bind(sinceMs).all<Album>();
  return { photos: photos.results ?? [], albums: albums.results ?? [] };
}
