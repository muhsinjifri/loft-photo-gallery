-- Two-user support: ownership + shared albums.

-- Identities. Ids are positional from ALLOWED_EMAILS: 'u1' is the first email,
-- 'u2' the second. Deliberately NO foreign key on owner_id — the backfill below
-- writes 'u1' before any users row can exist (this file cannot read
-- ALLOWED_EMAILS), and D1 enforces foreign keys.
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,   -- lowercased Cloudflare Access email
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
-- No seed row: auth.ts auto-provisions on first request.

-- NOT NULL DEFAULT 'u1' does double duty: it backfills every pre-existing row to
-- the primary user in a single pass, and it guarantees owner_id is never NULL at
-- read time (so no COALESCE in any visibility predicate).
ALTER TABLE photos ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'u1';
ALTER TABLE albums ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'u1';

ALTER TABLE albums ADD COLUMN is_shared  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE albums ADD COLUMN updated_at INTEGER;
UPDATE albums SET updated_at = created_at WHERE updated_at IS NULL;

-- idx_photos_taken(taken_at DESC) from 0001 has never been usable: the timeline
-- orders by COALESCE(taken_at, uploaded_at), an expression. These expression
-- indexes CAN serve it, but only if the query spells the expression identically
-- (see the SORT constant in lib/db.ts).
--
-- `id DESC` is listed explicitly because photos is a rowid table with a TEXT
-- primary key: SQLite would otherwise append rowid, and index ties would not be
-- ordered by id — which the composite keyset cursor depends on.
CREATE INDEX idx_photos_owner_sort
  ON photos(owner_id, COALESCE(taken_at, uploaded_at) DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_photos_album_sort
  ON photos(album_id, COALESCE(taken_at, uploaded_at) DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_photos_owner_trash ON photos(owner_id, deleted_at);
CREATE INDEX idx_albums_owner       ON albums(owner_id, is_shared);

DROP INDEX idx_photos_taken;
