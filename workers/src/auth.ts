import type { MiddlewareHandler, Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Env, AppVariables } from "./env";
import { allowedEmails } from "./env";
import { resolveUser } from "./lib/users";

export const DEV_USER_COOKIE = "loft_dev_user";

/**
 * Dev-only identity selection. Accepts either a full allowed email or a 1-based
 * index ("1" / "2").
 *
 * A cookie, not just a header: /img/* is loaded via plain <img src>, which cannot
 * carry a custom header but does send same-origin cookies. Without the cookie the
 * JSON API and the images would disagree about who you are, and every thumbnail
 * would 404 the moment you switched user. The header stays for curl.
 */
function resolveDevIdentity(c: Context<{ Bindings: Env; Variables: AppVariables }>, allowed: string[]): string {
  const raw = (c.req.header("X-Dev-User") ?? getCookie(c, DEV_USER_COOKIE) ?? "").trim().toLowerCase();
  if (!raw) return allowed[0];
  if (/^\d+$/.test(raw)) {
    const i = Number(raw) - 1;
    return allowed[i] ?? allowed[0];
  }
  return allowed.includes(raw) ? raw : allowed[0];
}

export const auth: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const allowed = allowedEmails(c.env);
  if (allowed.length === 0) return c.json({ error: "misconfigured", detail: "ALLOWED_EMAILS is empty" }, 500);

  let email: string;
  if (c.env.ENV === "dev") {
    email = resolveDevIdentity(c, allowed);
  } else {
    // Never consult the dev cookie/header here: a client-supplied value must not
    // be able to pick an identity in production.
    const hdr = (c.req.header("Cf-Access-Authenticated-User-Email") ?? "").trim().toLowerCase();
    if (!hdr || !allowed.includes(hdr)) return c.json({ error: "unauthorized" }, 401);
    email = hdr;
  }

  c.set("user", await resolveUser(c.env.DB, email, allowed.indexOf(email)));
  return next();
};
