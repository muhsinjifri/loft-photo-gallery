import { b64url } from "./session";

export interface UploadKeyRow {
  owner_id: string;
  token_hash: string;
  created_at: number;
  last_used_at: number | null;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Replaces any existing key for this person. Returns the plaintext key — the only time it exists. */
export async function createUploadKey(db: D1Database, ownerId: string): Promise<string> {
  const token = `loft_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  await db
    .prepare(
      `INSERT INTO upload_keys (owner_id, token_hash, created_at, last_used_at) VALUES (?, ?, ?, NULL)
       ON CONFLICT(owner_id) DO UPDATE SET token_hash = excluded.token_hash,
         created_at = excluded.created_at, last_used_at = NULL`,
    )
    .bind(ownerId, await sha256Hex(token), Date.now())
    .run();
  return token;
}

export async function getUploadKey(db: D1Database, ownerId: string): Promise<UploadKeyRow | null> {
  return db.prepare("SELECT * FROM upload_keys WHERE owner_id = ?").bind(ownerId).first<UploadKeyRow>();
}

export async function deleteUploadKey(db: D1Database, ownerId: string): Promise<void> {
  await db.prepare("DELETE FROM upload_keys WHERE owner_id = ?").bind(ownerId).run();
}

export async function findOwnerByToken(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT owner_id FROM upload_keys WHERE token_hash = ?")
    .bind(await sha256Hex(token))
    .first<{ owner_id: string }>();
  return row?.owner_id ?? null;
}

export async function touchUploadKey(db: D1Database, ownerId: string): Promise<void> {
  await db.prepare("UPDATE upload_keys SET last_used_at = ? WHERE owner_id = ?").bind(Date.now(), ownerId).run();
}
