/**
 * Loft's own long-lived sign-in, so a person isn't bounced through Cloudflare
 * Access every month.
 *
 * Access sessions top out at one month. Instead of wrapping the whole domain in
 * Access, Access guards only `/login`; passing it mints this cookie, which lasts a
 * year and slides forward whenever the app is used. The cookie is an HMAC-signed
 * `<email>.<issued-at>` — no server-side session table. Revocation is by removing
 * the address from ALLOWED_EMAILS (checked on every request) or by rotating
 * SESSION_SECRET, which signs everyone out.
 */

export const SESSION_COOKIE = "loft_session";
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60;
/** Re-issue the cookie once it is this old, so active use keeps it alive forever. */
const RENEW_AFTER_S = 7 * 24 * 60 * 60;

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyCache: { secret: string; key: CryptoKey } | null = null;

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (keyCache?.secret === secret) return keyCache.key;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  keyCache = { secret, key };
  return key;
}

export async function signSession(secret: string, email: string, nowS = Math.floor(Date.now() / 1000)): Promise<string> {
  const payload = `v1.${b64url(enc.encode(email))}.${nowS}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export interface Session {
  email: string;
  issuedAt: number;
  /** True when the cookie should be re-issued on this response. */
  renew: boolean;
}

export async function verifySession(secret: string, value: string | undefined): Promise<Session | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [v, emailB64, iatRaw, sigB64] = parts;
  let sig: Uint8Array;
  let email: string;
  try {
    sig = b64urlDecode(sigB64);
    email = new TextDecoder().decode(b64urlDecode(emailB64));
  } catch {
    return null;
  }
  // subtle.verify is constant-time, unlike comparing two strings.
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(`${v}.${emailB64}.${iatRaw}`));
  if (!ok) return null;
  const iat = Number(iatRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(iat) || iat > now + 60 || now - iat > SESSION_MAX_AGE_S) return null;
  return { email, issuedAt: iat, renew: now - iat > RENEW_AFTER_S };
}

export function sessionCookie(value: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_MAX_AGE_S}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function clearCookie(name: string, secure: boolean): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
