export interface Env {
  ENV: "dev" | "prod";
  /** Comma-separated. Order is load-bearing on first deploy: the first email becomes user 'u1'. */
  ALLOWED_EMAILS: string;
  /** @deprecated pre-0003 single-user config; read as a fallback so a stale deploy still boots. */
  ALLOWED_EMAIL?: string;
  /** HMAC key for Loft's own year-long sign-in cookie. Secret. Rotating it signs everyone out. */
  SESSION_SECRET?: string;
  /** Zero Trust team, e.g. "myteam" or "myteam.cloudflareaccess.com". Used to verify Access JWTs. */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's AUD tag (Zero Trust → Access → Applications → the app → Overview). */
  ACCESS_AUD?: string;
  BUCKET: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;
}

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  created_at: number;
}

/** Replaces the old `userEmail`, which no route ever read. */
export type AppVariables = {
  user: UserRow;
};

export function allowedEmails(env: Env): string[] {
  return (env.ALLOWED_EMAILS ?? env.ALLOWED_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
