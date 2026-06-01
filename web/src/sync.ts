import { api } from "./api";
import { db, getMeta, setMeta } from "./db";

const LAST_SYNC_KEY = "last_sync";

export async function syncFromServer(): Promise<void> {
  const last = Number(await getMeta(LAST_SYNC_KEY)) || 0;
  const res = await api.sync(last);
  await db.transaction("rw", db.photos, db.albums, db.meta, async () => {
    if (res.photos.length) await db.photos.bulkPut(res.photos);
    if (res.albums.length) await db.albums.bulkPut(res.albums);
    await setMeta(LAST_SYNC_KEY, String(res.server_time));
  });
}

export async function resetSync(): Promise<void> {
  await db.meta.delete(LAST_SYNC_KEY);
  await db.photos.clear();
  await db.albums.clear();
}
