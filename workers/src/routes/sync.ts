import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import { changedSince } from "../lib/db";

const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

r.get("/", async (c) => {
  const me = c.get("user");
  const since = Number(c.req.query("since") ?? 0);
  const { photos, albums, removed_photo_ids } = await changedSince(c.env.DB, me.id, since);
  return c.json({ photos, albums, removed_photo_ids, server_time: Date.now() });
});

export default r;
