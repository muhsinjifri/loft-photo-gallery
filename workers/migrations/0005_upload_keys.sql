-- Personal upload keys for pushing pictures in from an Apple Shortcut (POST /api/push).
--
-- One key per person: making a new one replaces the old, which is also how a
-- leaked key is revoked. Only a SHA-256 of the key is stored — the key itself is
-- shown once, when it is made, and never again.
CREATE TABLE upload_keys (
  owner_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
