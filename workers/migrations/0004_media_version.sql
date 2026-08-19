-- Separate "the media changed" from "the row changed".
--
-- cacheVer() on the client appends ?v=<n> to thumb/preview URLs to bust caches,
-- and it keyed off updated_at. But updated_at bumps on every metadata change —
-- filing a photo into an album, soft delete, restore, and above all the
-- share/unshare bump that touches every photo in an album at once. Each bump
-- minted a new URL, so the service worker, the edge cache and R2 all missed and
-- the picture re-downloaded even though not a single pixel had changed.
--
-- media_updated_at is set ONLY where the thumb/preview blobs are actually
-- rewritten (POST /api/photos/:id/thumbnail), so metadata edits no longer
-- invalidate images.
ALTER TABLE photos ADD COLUMN media_updated_at INTEGER;

-- Carry over the existing cache-busting state. Rows where updated_at is ahead of
-- uploaded_at are already being served at a versioned URL, and some of them are
-- genuinely re-thumbnailed videos — resetting those to NULL would send the URL
-- back to one whose cached blob is still the old placeholder frame.
UPDATE photos SET media_updated_at = updated_at WHERE updated_at > uploaded_at;
