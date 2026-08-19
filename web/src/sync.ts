import { api } from "./api";
import { db, getMeta, setMeta, LAST_SYNC_KEY, CURRENT_USER_KEY } from "./db";

/**
 * Delta sync — the 60s poll.
 *
 * Albums arrive as the full authoritative set every time (they are tiny), so the
 * album table is *replaced*, not merged. That is what makes renames and
 * un-shares propagate at all.
 */
export async function syncFromServer(): Promise<void> {
  const meId = await getMeta(CURRENT_USER_KEY);
  if (!meId) return; // identity not resolved yet — never reconcile against an unknown owner

  const last = Number(await getMeta(LAST_SYNC_KEY)) || 0;
  const res = await api.sync(last);
  const visibleAlbumIds = new Set(res.albums.map((a) => a.id));

  await db.transaction("rw", db.photos, db.albums, db.meta, async () => {
    if (res.albums.length) await db.albums.bulkPut(res.albums);
    const localAlbumIds = await db.albums.toCollection().primaryKeys();
    const goneAlbums = localAlbumIds.filter((id) => !visibleAlbumIds.has(id));
    if (goneAlbums.length) await db.albums.bulkDelete(goneAlbums);

    if (res.photos.length) await db.photos.bulkPut(res.photos);
    // Server-computed: photos that changed and are no longer visible to us. A
    // client-side rule ("drop partner photos not in a shared album") cannot work
    // here, because it would read the stale local album_id — the server stops
    // sending the photo the moment it becomes invisible, so we never learn where
    // it moved to.
    if (res.removed_photo_ids.length) await db.photos.bulkDelete(res.removed_photo_ids);

    await setMeta(LAST_SYNC_KEY, String(res.server_time));
  });
}

/**
 * Authoritative full snapshot — runs once on boot. `since=0` returns everything
 * visible to us, so anything local that is absent is, by definition, gone. This
 * is also the only thing that clears out rows the nightly cron hard-deleted.
 */
export async function fullResync(): Promise<void> {
  const meId = await getMeta(CURRENT_USER_KEY);
  if (!meId) return;

  const res = await api.sync(0);
  const serverPhotoIds = new Set(res.photos.map((p) => p.id));
  const serverAlbumIds = new Set(res.albums.map((a) => a.id));

  await db.transaction("rw", db.photos, db.albums, db.meta, async () => {
    if (res.albums.length) await db.albums.bulkPut(res.albums);
    if (res.photos.length) await db.photos.bulkPut(res.photos);

    const localAlbumIds = await db.albums.toCollection().primaryKeys();
    const goneAlbums = localAlbumIds.filter((id) => !serverAlbumIds.has(id));
    if (goneAlbums.length) await db.albums.bulkDelete(goneAlbums);

    const localPhotoIds = await db.photos.toCollection().primaryKeys();
    const gonePhotos = localPhotoIds.filter((id) => !serverPhotoIds.has(id));
    if (gonePhotos.length) await db.photos.bulkDelete(gonePhotos);

    await setMeta(LAST_SYNC_KEY, String(res.server_time));
  });
}

export async function resetSync(): Promise<void> {
  await db.meta.delete(LAST_SYNC_KEY);
  await db.photos.clear();
  await db.albums.clear();
}

/**
 * The service worker CacheFirst-caches /img/thumb/ and /img/preview/ forever.
 * Those are the only user-scoped bytes it holds and they survive an IndexedDB
 * wipe, so without this a second identity on the same browser profile could
 * still render the previous person's thumbnails.
 *
 * Cache names are matched by pattern, not by the literal names in vite.config.ts:
 * Workbox may prefix runtime caches depending on version.
 *
 * Deliberately does NOT unregister the service worker — that would also destroy
 * the precache and force a full app re-download, for no benefit: the precache is
 * only JS/CSS/HTML and is identical for both users.
 */
export async function clearImageCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => /thumb|preview/i.test(k)).map((k) => caches.delete(k)));
  } catch (e) {
    console.warn("[sync] could not clear image caches", e);
  }
}

/** Everything that is scoped to one identity. Used on identity change and by the dev switcher. */
export async function wipeLocalIdentityData(): Promise<void> {
  await db.photos.clear();
  await db.albums.clear();
  await db.meta.clear();
  await clearImageCaches();
}
