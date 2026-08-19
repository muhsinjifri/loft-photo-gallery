import type { UserRow } from "../env";
import type { PublicUser } from "@loft/shared";

/**
 * Config-like data, so it is safe as isolate-global state. Bounded at one entry
 * per allowed email; the TTL bounds staleness after a display-name change.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { row: UserRow; at: number }>();

export function bustUserCache(email?: string): void {
  if (email) cache.delete(email);
  else cache.clear();
}

/** "ada.lovelace+photos@example.com" -> "Ada Lovelace" */
export function defaultDisplayName(email: string): string {
  const local = email.split("@")[0].split("+")[0];
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return email;
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Resolve an allowed email to its users row, provisioning it on first sight.
 *
 * The id is positional (`u1`, `u2`), which is what lets migration 0003 backfill
 * every pre-existing row to 'u1' with a literal default — no runtime claim step.
 */
export async function resolveUser(db: D1Database, email: string, index: number): Promise<UserRow> {
  const hit = cache.get(email);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.row;

  const found = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
  if (found) {
    cache.set(email, { row: found, at: Date.now() });
    return found;
  }

  const id = `u${index + 1}`;
  try {
    // ON CONFLICT(id) covers "this user changed their Cloudflare Access email":
    // the row keeps its id, so ownership of every photo survives, and only the
    // address moves.
    await db
      .prepare(
        `INSERT INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET email = excluded.email`,
      )
      .bind(id, email, defaultDisplayName(email), Date.now())
      .run();
  } catch (e) {
    // UNIQUE(email) can still fire if both addresses are swapped in one deploy.
    throw new Error(`identity_conflict: could not provision ${id} for ${email}: ${String(e)}`);
  }

  const row = (await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>())!;
  cache.set(email, { row, at: Date.now() });
  return row;
}

export async function setDisplayName(db: D1Database, id: string, name: string): Promise<UserRow> {
  await db.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(name, id).run();
  bustUserCache();
  return (await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>())!;
}

export async function listUsers(db: D1Database): Promise<PublicUser[]> {
  const res = await db.prepare("SELECT id, display_name FROM users ORDER BY id").all<PublicUser>();
  return res.results ?? [];
}

/**
 * Everyone who lives here, whether or not they have ever opened the app.
 *
 * `users` rows are only written on a person's first request, so a freshly
 * deployed two-person Loft looks single-user until the second person visits —
 * which hid every sharing control behind the very thing it was needed for. Ids
 * are positional, so a configured email's id is knowable in advance; entries
 * without a row are returned as `pending` with a name derived from the address.
 */
export async function roster(db: D1Database, emails: string[]): Promise<PublicUser[]> {
  const existing = await listUsers(db);
  const byId = new Map(existing.map((u) => [u.id, u]));

  const configured = emails.map((email, i) => {
    const id = `u${i + 1}`;
    const row = byId.get(id);
    byId.delete(id);
    return row ?? { id, display_name: defaultDisplayName(email), pending: true };
  });

  // Anyone provisioned who is no longer in ALLOWED_EMAILS still owns photos, so
  // keep them in the roster or their pictures lose their attribution.
  return [...configured, ...byId.values()];
}
