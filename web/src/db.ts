import Dexie, { type Table } from "dexie";
import type { Photo, Album } from "@loft/shared";

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
