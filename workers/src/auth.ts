import type { MiddlewareHandler } from "hono";
import type { Env, AppVariables } from "./env";

export const auth: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  if (c.env.ENV === "dev") {
    c.set("userEmail", c.env.ALLOWED_EMAIL);
    return next();
  }

  const email = c.req.header("Cf-Access-Authenticated-User-Email");
  if (!email || email.toLowerCase() !== c.env.ALLOWED_EMAIL.toLowerCase()) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("userEmail", email);
  return next();
};
