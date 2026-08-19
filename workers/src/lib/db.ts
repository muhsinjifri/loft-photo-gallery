import type { Photo, Album, Scope } from "@loft/shared";

/**
 * Must match the expression in idx_photos_*_sort character for character, or the
 * query planner falls back to a full scan + sort.
 */
const SORT = "COALESCE(taken_at, uploaded_at)";

/**
 * Albums shared with the other person. With exactly two users, "is_shared" IS the
 * membership list — a third user would see everything in every shared album, and
 * that day this needs an album_members table.
 *
 * Written as `album_id IN (...)`, never `NOT IN`: photos with a NULL album_id
 * yield NULL IN (...) which is not true, so they are excluded, which is correct.
 * `NOT IN` with NULLs would silently empty the whole result.
 */
const SHARED = "(SELECT id FROM albums WHERE is_shared = 1)";

/** Photos the viewer is allowed to see at all: their own, plus anything in a shared album. */
const VISIBLE = `(owner_id = ? OR album_id IN ${SHARED})`;

/**
 * The complement of VISIBLE, spelled out rather than written as `NOT VISIBLE`.
 *
 * `NOT (owner_id = ? OR album_id IN (...))` is NOT equivalent: for a photo with
 * a NULL album_id it evaluates to NOT (false OR NULL) = NULL, which is not TRUE,
 * so the row is silently dropped. That would mean a photo the owner moved out of
 * a shared album and into no album at all — the most ordinary way to un-share a
 * single picture — never reaches the partner as a removal, and lingers in their
 * mirror forever.
 *
 * `album_id NOT IN (...)` is safe here because album ids are a primary key and
 * the subquery can never yield NULL; the NULL album_id case is handled
 * explicitly, and owner_id is NOT NULL.
 */
const INVISIBLE = `(owner_id <> ? AND (album_id IS NULL OR album_id NOT IN ${SHARED}))`;

export async function insertPhoto(db: D1Database, p: Photo): Promise<void> {
  await db
    .prepare(
      `INSERT INTO photos
       (id, r2_key, thumb_key, preview_key, filename, mime, size, width, height,
        duration_ms, taken_at, uploaded_at, album_id, year_month, exif_json, deleted_at, updated_at,
        media_updated_at, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      // NULL on upload: a fresh photo's URL needs no version, so it stays
      // cacheable at a stable address forever.
      p.media_updated_at,
      p.owner_id,
    )
    .run();
}

export async function updatePhotoThumbMeta(
  db: D1Database,
  id: string,
  ownerId: string,
  m: { width: number | null; height: number | null; duration_ms: number | null; updated_at: number },
): Promise<boolean> {
  const res = await db
    // The only place the R2 blobs are rewritten, so the only place
    // media_updated_at moves.
    .prepare(
      `UPDATE photos SET width = ?, height = ?, duration_ms = ?, updated_at = ?, media_updated_at = ?
       WHERE id = ? AND owner_id = ?`,
    )
    .bind(m.width, m.height, m.duration_ms, m.updated_at, m.updated_at, id, ownerId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export interface ListFilter {
  viewerId: string;
  /** Defaults to "visible" (own + shared). Forced to "mine" when `trash` is set. */
  scope?: Scope | "visible";
  /** Composite keyset cursor, "<sort>_<id>". */
  cursor?: string | null;
  limit: number;
  album_id?: string | null;
  year_month?: string | null;
  trash?: boolean;
}

/** Cursor is "<sortValue>_<uuid>". UUIDs contain "-", never "_", so split on the last underscore. */
export function makeCursor(p: Photo): string {
  return `${p.taken_at ?? p.uploaded_at}_${p.id}`;
}

function splitCursor(c: string): [number, string] | null {
  const i = c.lastIndexOf("_");
  if (i < 0) return null;
  const ts = Number(c.slice(0, i));
  const id = c.slice(i + 1);
  if (!Number.isFinite(ts) || !id) return null;
  return [ts, id];
}

export async function listPhotos(db: D1Database, f: ListFilter): Promise<Photo[]> {
  const where: string[] = [];
  const binds: unknown[] = [];

  // NOTE: binds are positional and pushed as clauses are appended. Reordering a
  // where.push without moving its matching binds.push yields a silently wrong
  // query, not an error.
  where.push(f.trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL");

  // Trash is always personal: only the uploader can delete, so a shared album's
  // trash would otherwise leak the partner's deletions into your bin.
  const scope = f.trash ? "mine" : (f.scope ?? "visible");
  if (scope === "mine") {
    where.push("owner_id = ?");
    binds.push(f.viewerId);
  } else if (scope === "ours") {
    where.push(`album_id IN ${SHARED}`);
  } else {
    where.push(VISIBLE);
    binds.push(f.viewerId);
  }

  if (f.album_id) {
    where.push("album_id = ?");
    binds.push(f.album_id);
  }
  if (f.year_month) {
    where.push("year_month = ?");
    binds.push(f.year_month);
  }
  if (f.cursor) {
    const parts = splitCursor(f.cursor);
    if (parts) {
      // Composite keyset: a bare `SORT < ?` skips the remainder of any tie group
      // that straddles a page boundary, and two people uploading the same event
      // makes exact-timestamp ties considerably likelier.
      where.push(`(${SORT} < ? OR (${SORT} = ? AND id < ?))`);
      binds.push(parts[0], parts[0], parts[1]);
    }
  }

  const sql = `SELECT * FROM photos WHERE ${where.join(" AND ")}
               ORDER BY ${SORT} DESC, id DESC LIMIT ?`;
  binds.push(f.limit);
  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<Photo>();
  return res.results ?? [];
}

/**
 * A photo the viewer may look at. Deliberately does NOT filter deleted_at — the
 * owner's restore flow and /img both need soft-deleted rows.
 */
export async function getVisiblePhoto(db: D1Database, id: string, viewerId: string): Promise<Photo | null> {
  return await db
    .prepare(`SELECT * FROM photos WHERE id = ? AND ${VISIBLE}`)
    .bind(id, viewerId)
    .first<Photo>();
}

export async function softDeletePhoto(db: D1Database, id: string, ownerId: string, now: number): Promise<boolean> {
  const res = await db
    .prepare("UPDATE photos SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL")
    .bind(now, now, id, ownerId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function restorePhoto(db: D1Database, id: string, ownerId: string, now: number): Promise<boolean> {
  // updated_at must be bumped: clearing deleted_at removes the only field
  // changedSince was matching on, so without this a restore never reaches any
  // other device.
  const res = await db
    .prepare("UPDATE photos SET deleted_at = NULL, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(now, id, ownerId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function updatePhotoAlbum(
  db: D1Database,
  id: string,
  ownerId: string,
  albumId: string | null,
  now: number,
): Promise<boolean> {
  // Bump updated_at so the album change propagates to other devices via sync.
  const res = await db
    .prepare("UPDATE photos SET album_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(albumId, now, id, ownerId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/**
 * File many photos into an album (or out of one, with albumId = null) in a single
 * D1 statement. Scoped to the caller's own rows: filing is owner-only, exactly
 * like delete, so a photo of the partner's silently stays put rather than
 * failing the whole batch.
 *
 * Returns the updated rows so the client can patch its mirror without a refetch.
 */
export async function updatePhotoAlbumBulk(
  db: D1Database,
  ids: string[],
  ownerId: string,
  albumId: string | null,
  now: number,
): Promise<Photo[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  await db
    .prepare(`UPDATE photos SET album_id = ?, updated_at = ? WHERE id IN (${placeholders}) AND owner_id = ?`)
    .bind(albumId, now, ...ids, ownerId)
    .run();
  const res = await db
    .prepare(`SELECT * FROM photos WHERE id IN (${placeholders}) AND owner_id = ?`)
    .bind(...ids, ownerId)
    .all<Photo>();
  return res.results ?? [];
}

/** Cron only — intentionally global; purges by deleted_at age across both owners. */
export async function hardDeletePhotos(db: D1Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.prepare(`DELETE FROM photos WHERE id IN (${placeholders})`).bind(...ids).run();
}

/** Cron only — intentionally global. */
export async function findExpiredDeletes(db: D1Database, cutoffMs: number): Promise<Photo[]> {
  const res = await db
    .prepare("SELECT * FROM photos WHERE deleted_at IS NOT NULL AND deleted_at < ?")
    .bind(cutoffMs)
    .all<Photo>();
  return res.results ?? [];
}

export async function listAlbums(db: D1Database, viewerId: string): Promise<Album[]> {
  const res = await db
    .prepare("SELECT * FROM albums WHERE owner_id = ? OR is_shared = 1 ORDER BY created_at DESC")
    .bind(viewerId)
    .all<Album>();
  return res.results ?? [];
}

/** An album the viewer may put their own photos into, or open. */
export async function getUsableAlbum(db: D1Database, id: string, viewerId: string): Promise<Album | null> {
  return await db
    .prepare("SELECT * FROM albums WHERE id = ? AND (owner_id = ? OR is_shared = 1)")
    .bind(id, viewerId)
    .first<Album>();
}

export async function insertAlbum(db: D1Database, a: Album): Promise<void> {
  await db
    .prepare(
      "INSERT INTO albums (id, name, cover_photo_id, created_at, owner_id, is_shared, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(a.id, a.name, a.cover_photo_id, a.created_at, a.owner_id, a.is_shared, a.updated_at ?? a.created_at)
    .run();
}

export interface AlbumPatch {
  name?: string;
  is_shared?: 0 | 1;
  cover_photo_id?: string | null;
}

/**
 * Owner-only album update. When is_shared changes, every photo in the album gets
 * its updated_at bumped in the same batch — that is mandatory, not an
 * optimisation: without it a newly shared album's existing photos fall outside
 * the partner's `since` window and the album looks empty to them.
 */
export async function updateAlbum(
  db: D1Database,
  id: string,
  ownerId: string,
  patch: AlbumPatch,
  now: number,
): Promise<Album | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    binds.push(patch.name);
  }
  if (patch.is_shared !== undefined) {
    sets.push("is_shared = ?");
    binds.push(patch.is_shared);
  }
  if (patch.cover_photo_id !== undefined) {
    sets.push("cover_photo_id = ?");
    binds.push(patch.cover_photo_id);
  }
  if (sets.length === 0) return await getUsableAlbum(db, id, ownerId);
  sets.push("updated_at = ?");
  binds.push(now);

  const statements = [
    db
      .prepare(`UPDATE albums SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`)
      .bind(...binds, id, ownerId),
  ];
  if (patch.is_shared !== undefined) {
    statements.push(db.prepare("UPDATE photos SET updated_at = ? WHERE album_id = ?").bind(now, id));
  }
  const results = await db.batch(statements);
  if ((results[0].meta?.changes ?? 0) === 0) return null;

  return await db.prepare("SELECT * FROM albums WHERE id = ?").bind(id).first<Album>();
}

/**
 * Delete an album. The pictures in it are NOT deleted — they are unfiled, which
 * is what "delete album" means everywhere else and what people expect.
 *
 * Every photo is unfiled, including the other person's if this was a shared
 * album. Leaving their album_id pointing at a row that no longer exists would be
 * dangling data, and the alternative — refusing to delete until they clear their
 * own pictures out — makes the owner's album hostage to someone else. Their
 * photos stay entirely theirs; they just stop being in a collection that is gone.
 *
 * The caller must have already established ownership: the UPDATE is
 * unconditional, so running this for a non-owner would unfile photos and then
 * fail to delete anything.
 */
export async function deleteAlbum(
  db: D1Database,
  id: string,
  ownerId: string,
  now: number,
): Promise<boolean> {
  const results = await db.batch([
    db.prepare("UPDATE photos SET album_id = NULL, updated_at = ? WHERE album_id = ?").bind(now, id),
    db.prepare("DELETE FROM albums WHERE id = ? AND owner_id = ?").bind(id, ownerId),
  ]);
  return (results[1].meta?.changes ?? 0) > 0;
}

export async function changedSince(
  db: D1Database,
  viewerId: string,
  sinceMs: number,
): Promise<{ photos: Photo[]; albums: Album[]; removed_photo_ids: string[] }> {
  const CHANGED = "(uploaded_at > ? OR COALESCE(deleted_at, 0) > ? OR COALESCE(updated_at, 0) > ?)";

  const photos = await db
    .prepare(`SELECT * FROM photos WHERE ${VISIBLE} AND ${CHANGED}`)
    .bind(viewerId, sinceMs, sinceMs, sinceMs)
    .all<Photo>();

  // Rows that changed but are no longer visible to this viewer — the owner moved
  // them out of a shared album, or un-shared it. Computed on the fly: the
  // updated_at bump has already happened at the mutation site, so no tombstone
  // table is needed, and there is no retention horizon to track.
  //
  // Skipped at since=0: a first-time client has nothing to remove, and the
  // predicate would otherwise return every photo in the database it can't see.
  const removed_photo_ids = sinceMs
    ? ((
        await db
          .prepare(`SELECT id FROM photos WHERE ${CHANGED} AND ${INVISIBLE}`)
          .bind(sinceMs, sinceMs, sinceMs, viewerId)
          .all<{ id: string }>()
      ).results ?? []).map((r) => r.id)
    : [];

  // Full authoritative set, not a delta. This is what makes renames and
  // un-shares propagate at all: the old query filtered albums on created_at, so
  // any later change to an album never reached another device.
  const albums = await db
    .prepare("SELECT * FROM albums WHERE owner_id = ? OR is_shared = 1 ORDER BY created_at DESC")
    .bind(viewerId)
    .all<Album>();

  return {
    photos: photos.results ?? [],
    albums: albums.results ?? [],
    removed_photo_ids,
  };
}
