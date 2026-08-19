import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import { listAlbums, insertAlbum, getUsableAlbum, updateAlbum, getVisiblePhoto } from "../lib/db";
import type { Album, AlbumPatchBody } from "@loft/shared";

const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

r.get("/", async (c) => {
  const me = c.get("user");
  const albums = await listAlbums(c.env.DB, me.id);
  return c.json({ albums });
});

r.post("/", async (c) => {
  const me = c.get("user");
  const body = await c.req.json<{ name: string; is_shared?: boolean }>();
  if (!body.name?.trim()) return c.json({ error: "name_required" }, 400);
  const now = Date.now();
  const album: Album = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    cover_photo_id: null,
    created_at: now,
    owner_id: me.id,
    is_shared: body.is_shared ? 1 : 0,
    updated_at: now,
  };
  await insertAlbum(c.env.DB, album);
  return c.json({ album });
});

r.patch("/:id", async (c) => {
  const me = c.get("user");
  const id = c.req.param("id");

  const existing = await getUsableAlbum(c.env.DB, id, me.id);
  if (!existing) return c.json({ error: "not_found" }, 404);
  // You can add your photos to someone else's shared album, but only its owner
  // controls its name and whether it stays shared.
  if (existing.owner_id !== me.id) return c.json({ error: "not_owner" }, 403);

  const body = await c.req.json<AlbumPatchBody>();
  const patch: { name?: string; is_shared?: 0 | 1; cover_photo_id?: string | null } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name || name.length > 200) return c.json({ error: "name_required" }, 400);
    patch.name = name;
  }
  if (body.is_shared !== undefined) {
    patch.is_shared = body.is_shared ? 1 : 0;
  }
  if (body.cover_photo_id !== undefined) {
    if (body.cover_photo_id !== null) {
      const cover = await getVisiblePhoto(c.env.DB, body.cover_photo_id, me.id);
      if (!cover || cover.album_id !== id) return c.json({ error: "bad_cover" }, 400);
    }
    patch.cover_photo_id = body.cover_photo_id;
  }

  const album = await updateAlbum(c.env.DB, id, me.id, patch, Date.now());
  if (!album) return c.json({ error: "not_found" }, 404);
  return c.json({ album });
});

export default r;
