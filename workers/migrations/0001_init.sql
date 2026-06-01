CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  thumb_key TEXT NOT NULL,
  preview_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  taken_at INTEGER,
  uploaded_at INTEGER NOT NULL,
  album_id TEXT,
  year_month TEXT,
  exif_json TEXT,
  deleted_at INTEGER
);
CREATE INDEX idx_photos_taken ON photos(taken_at DESC);
CREATE INDEX idx_photos_album ON photos(album_id);
CREATE INDEX idx_photos_ym ON photos(year_month);
CREATE INDEX idx_photos_deleted ON photos(deleted_at);

CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cover_photo_id TEXT,
  created_at INTEGER NOT NULL
);
