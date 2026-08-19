import Dexie, { type Table } from "dexie";
import type { Photo, Album } from "@loft/shared";

export const LAST_SYNC_KEY = "last_sync";
/** users.id of whoever this mirror belongs to. Guards against a second identity on the same profile. */
export const CURRENT_USER_KEY = "current_user_id";
/** Cached MeResponse, so an offline cold boot can still render the mirror. */
export const IDENTITY_KEY = "identity";

class LoftDB extends Dexie {
  photos!: Table<Photo, string>;
  albums!: Table<Album, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super("loft");
    this.version(1).stores({
      photos: "id, taken_at, uploaded_at, album_id, year_month, deleted_at",
      albums: "id, created_at",
      meta: "key",
    });

    // v2 adds ownership. Only photos.owner_id is worth indexing — backfill
    // scoping and the Settings counts run on every boot; albums are a few dozen
    // rows where toArray() + a JS filter beats an index lookup.
    this.version(2)
      .stores({
        photos: "id, taken_at, uploaded_at, album_id, year_month, deleted_at, owner_id",
        albums: "id, created_at",
        meta: "key",
      })
      .upgrade(async (tx) => {
        // Wipe rather than stamp. The mirror cannot infer owner_id, and the only
        // guess available ("all mine") is exactly the wrong one: it would render
        // delete buttons on photos that turn out to be the partner's. Clearing
        // last_sync is required regardless — otherwise the delta never re-sends
        // the old rows and they stay owner-less forever — so an in-place stamp
        // would cost the same refetch without the certainty.
        await tx.table("photos").clear();
        await tx.table("albums").clear();
        await tx.table("meta").delete(LAST_SYNC_KEY);
        await tx.table("meta").delete("backfill_skip"); // legacy un-namespaced key
      });
  }
}

export const db = new LoftDB();

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}
