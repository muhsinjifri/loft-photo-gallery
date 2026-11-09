import type { MiddlewareHandler, Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Env, AppVariables } from "./env";
import { allowedEmails } from "./env";
import { resolveUser } from "./lib/users";
import { SESSION_COOKIE, sessionCookie, signSession, verifySession } from "./lib/session";
import { accessConfigured, verifyAccessJwt } from "./lib/access";

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

/**
 * Who is this production request from? Loft's own year-long cookie first; failing
 * that, a *verified* Access JWT (present on /login, and on every path while Access
 * still wraps the whole domain). The plain Cf-Access-Authenticated-User-Email
 * header is deliberately ignored: with Access guarding only /login it is
 * client-controlled on every other path.
 *
 * Returns the cookie to set on the response, if one should be (re)issued.
 */
export async function resolveProdIdentity(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  allowed: string[],
): Promise<{ email: string; setCookie: string | null } | null> {
  const secret = c.env.SESSION_SECRET;
  if (secret) {
    const s = await verifySession(secret, getCookie(c, SESSION_COOKIE));
    if (s && allowed.includes(s.email)) {
      return { email: s.email, setCookie: s.renew ? sessionCookie(await signSession(secret, s.email), true) : null };
    }
  }
  const jwt = c.req.header("Cf-Access-Jwt-Assertion") ?? getCookie(c, "CF_Authorization");
  const email = await verifyAccessJwt(c.env, jwt);
  if (!email || !allowed.includes(email)) return null;
  return { email, setCookie: secret ? sessionCookie(await signSession(secret, email), true) : null };
}

export const auth: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  const allowed = allowedEmails(c.env);
  if (allowed.length === 0) return c.json({ error: "misconfigured", detail: "ALLOWED_EMAILS is empty" }, 500);

  let email: string;
  let setCookie: string | null = null;
  if (c.env.ENV === "dev") {
    email = resolveDevIdentity(c, allowed);
  } else {
    // Never consult the dev cookie/header here: a client-supplied value must not
    // be able to pick an identity in production.
    if (!c.env.SESSION_SECRET || !accessConfigured(c.env)) {
      return c.json(
        { error: "misconfigured", detail: "SESSION_SECRET, ACCESS_TEAM_DOMAIN and ACCESS_AUD must be set" },
        500,
      );
    }
    const who = await resolveProdIdentity(c, allowed);
    if (!who) return c.json({ error: "unauthorized" }, 401);
    email = who.email;
    setCookie = who.setCookie;
  }

  c.set("user", await resolveUser(c.env.DB, email, allowed.indexOf(email)));
  await next();
  // Only on JSON API responses: /img/* may return a Response straight out of the
  // edge cache, whose headers are immutable. /api/me runs on every app boot, so
  // the cookie still slides forward for anyone who opens the app.
  if (setCookie && c.req.path.startsWith("/api/")) c.header("Set-Cookie", setCookie, { append: true });
};
