import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import { listAlbums, insertAlbum } from "../lib/db";
import type { Album } from "@loft/shared";

const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

r.get("/", async (c) => {
  const albums = await listAlbums(c.env.DB);
  return c.json({ albums });
});

r.post("/", async (c) => {
  const body = await c.req.json<{ name: string }>();
  if (!body.name?.trim()) return c.json({ error: "name_required" }, 400);
  const album: Album = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    cover_photo_id: null,
    created_at: Date.now(),
  };
  await insertAlbum(c.env.DB, album);
  return c.json({ album });
});

export default r;
