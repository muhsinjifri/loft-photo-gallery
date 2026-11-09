import type { Env } from "../env";
import { b64urlDecode } from "./session";

/**
 * Verify a Cloudflare Access JWT and return the email it was issued to.
 *
 * Once Access guards only `/login`, every other path is reachable without it,
 * so the plain `Cf-Access-Authenticated-User-Email` header can no longer be
 * trusted — anyone could send it. The signed JWT (the `Cf-Access-Jwt-Assertion`
 * header, or the `CF_Authorization` cookie) cannot be forged, so it is the only
 * thing this Worker accepts from Access.
 */

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

const CERTS_TTL_MS = 60 * 60 * 1000;
let certs: { team: string; at: number; keys: Map<string, CryptoKey> } | null = null;

/** Accepts "myteam", "myteam.cloudflareaccess.com", or a full https URL. */
export function teamOrigin(raw: string): string {
  let t = raw.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!t.includes(".")) t = `${t}.cloudflareaccess.com`;
  return `https://${t}`;
}

async function loadKeys(team: string, force = false): Promise<Map<string, CryptoKey>> {
  if (!force && certs && certs.team === team && Date.now() - certs.at < CERTS_TTL_MS) return certs.keys;
  const res = await fetch(`${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`access certs ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = new Map<string, CryptoKey>();
  for (const k of body.keys ?? []) {
    if (k.kty !== "RSA") continue;
    keys.set(
      k.kid,
      await crypto.subtle.importKey(
        "jwk",
        { kty: k.kty, n: k.n, e: k.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      ),
    );
  }
  certs = { team, at: Date.now(), keys };
  return keys;
}

export function accessConfigured(env: Env): boolean {
  return !!env.ACCESS_TEAM_DOMAIN && !!env.ACCESS_AUD;
}

export async function verifyAccessJwt(env: Env, token: string | undefined): Promise<string | null> {
  if (!token || !accessConfigured(env)) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const dec = new TextDecoder();
    const header = JSON.parse(dec.decode(b64urlDecode(parts[0]))) as { alg?: string; kid?: string };
    if (header.alg !== "RS256" || !header.kid) return null;

    const team = teamOrigin(env.ACCESS_TEAM_DOMAIN!);
    let key = (await loadKeys(team)).get(header.kid);
    // Access rotates its signing keys; an unknown kid means our copy is stale.
    if (!key) key = (await loadKeys(team, true)).get(header.kid);
    if (!key) return null;

    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;

    const p = JSON.parse(dec.decode(b64urlDecode(parts[1]))) as {
      aud?: string | string[];
      iss?: string;
      exp?: number;
      nbf?: number;
      email?: string;
    };
    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (p.iss !== team) return null;
    if (!p.exp || p.exp < now) return null;
    if (p.nbf && p.nbf > now + 60) return null;
    return p.email ? p.email.trim().toLowerCase() : null;
  } catch (e) {
    console.warn("[access] jwt verification failed", e);
    return null;
  }
}
