import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import { changedSince } from "../lib/db";

const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

r.get("/", async (c) => {
  const since = Number(c.req.query("since") ?? 0);
  const { photos, albums } = await changedSince(c.env.DB, since);
  return c.json({ photos, albums, server_time: Date.now() });
});

export default r;
