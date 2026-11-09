import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import { createUploadKey, deleteUploadKey, getUploadKey } from "../lib/uploadKeys";

/** Manage your own Shortcut upload key. Session-authenticated like the rest of /api. */
const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

r.get("/", async (c) => {
  const row = await getUploadKey(c.env.DB, c.get("user").id);
  return c.json({
    exists: !!row,
    created_at: row?.created_at ?? null,
    last_used_at: row?.last_used_at ?? null,
  });
});

r.post("/", async (c) => {
  const token = await createUploadKey(c.env.DB, c.get("user").id);
  return c.json({ token });
});

r.delete("/", async (c) => {
  await deleteUploadKey(c.env.DB, c.get("user").id);
  return c.json({ ok: true });
});

export default r;
