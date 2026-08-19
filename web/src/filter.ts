import type { Photo, Scope } from "@loft/shared";
import { db } from "./db";

export interface PhotoFilter {
  album_id?: string | null;
  year_month?: string | null;
  trash?: boolean;
  /**
   * "mine" (default): photos I own, whether or not they sit in a shared album.
   * "ours": photos — either person's — that live in a shared album.
   *
   * The two overlap rather than partition: my own photo in a shared album shows
   * up in both. Ignored when album_id is set (the album itself is the scope) and
   * forced to "mine" when trash is set.
   */
  scope?: Scope;
}

export async function loadSharedAlbumIds(): Promise<Set<string>> {
  const rows = await db.albums.filter((a) => a.is_shared === 1).toArray();
  return new Set(rows.map((a) => a.id));
}

/**
 * The single source of truth for "which photos belong in this view", shared by
 * MasonryGrid, Calendar and the Albums cover/count query so the predicate cannot
 * drift between them.
 *
 * Reading db.albums in here is deliberate: useLiveQuery subscribes to every
 * table its callback touches, so flipping an album's is_shared re-runs the photo
 * query with no manual dependency wiring.
 */
export async function queryPhotos(filter: PhotoFilter, meId: string): Promise<Photo[]> {
  // Trash is always personal: you can only delete your own photos, so a shared
  // bin would just leak the partner's deletions into yours.
  const scope: Scope = filter.trash ? "mine" : (filter.scope ?? "mine");
  const inAlbumView = filter.album_id !== undefined && filter.album_id !== null;
  const sharedIds = !inAlbumView && scope === "ours" ? await loadSharedAlbumIds() : null;

  const rows = await db.photos
    .filter((p) => {
      if (filter.trash) {
        if (!p.deleted_at) return false;
      } else if (p.deleted_at) {
        return false;
      }

      if (inAlbumView) {
        // Inside an album the album IS the scope — a shared album shows both
        // people's photos regardless of the global toggle.
        if (p.album_id !== filter.album_id) return false;
      } else if (scope === "ours") {
        if (!p.album_id || !sharedIds!.has(p.album_id)) return false;
      } else if (p.owner_id !== meId) {
        return false;
      }

      if (filter.year_month && p.year_month !== filter.year_month) return false;
      return true;
    })
    .toArray();

  rows.sort((a, b) => (b.taken_at ?? b.uploaded_at) - (a.taken_at ?? a.uploaded_at));
  return rows;
}
