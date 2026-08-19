import { Hono } from "hono";
import type { Env, AppVariables } from "../env";
import { roster, setDisplayName } from "../lib/users";
import type { Me } from "@loft/shared";
import { allowedEmails } from "../env";

const r = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function toMe(u: { id: string; email: string; display_name: string }): Me {
  return { id: u.id, email: u.email, display_name: u.display_name };
}

r.get("/", async (c) => {
  const me = c.get("user");
  // users carries no emails — it exists so the UI can label "added by <name>"
  // and know a second resident exists before they have ever signed in.
  const users = await roster(c.env.DB, allowedEmails(c.env));
  return c.json({ me: toMe(me), users });
});

r.patch("/", async (c) => {
  const me = c.get("user");
  const body = await c.req.json<{ display_name?: string }>();
  const name = body.display_name?.trim();
  if (!name || name.length > 60) return c.json({ error: "bad_display_name" }, 400);
  const updated = await setDisplayName(c.env.DB, me.id, name);
  const users = await roster(c.env.DB, allowedEmails(c.env));
  return c.json({ me: toMe(updated), users });
});

export default r;
