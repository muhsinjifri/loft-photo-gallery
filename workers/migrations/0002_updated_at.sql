ALTER TABLE photos ADD COLUMN updated_at INTEGER;
UPDATE photos SET updated_at = uploaded_at WHERE updated_at IS NULL;
CREATE INDEX idx_photos_updated ON photos(updated_at);
