import { useEffect, useRef } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Users } from "lucide-react";
import { db } from "../db";
import { api } from "../api";
import { syncFromServer } from "../sync";
import { useUser } from "../user";
import { GalleryView } from "./GalleryView";

export function AlbumDetail() {
  const { id } = useParams();
  const { me, partner, displayNameFor } = useUser();
  const album = useLiveQuery(() => (id ? db.albums.get(id) : undefined), [id]);

  // useLiveQuery yields undefined while it is still loading, so "missing" can
  // only be trusted once it has resolved at least once. Without this the page
  // would bounce to /albums on first paint.
  const resolved = useRef(false);
  useEffect(() => {
    if (album !== undefined) resolved.current = true;
  }, [album]);

  // The other person un-shared this album out from under us.
  if (id && album === undefined && resolved.current) return <Navigate to="/albums" replace />;

  const mine = !!album && album.owner_id === me?.id;
  const shared = album?.is_shared === 1;

  async function toggleShare() {
    if (!album) return;
    const { album: updated } = await api.updateAlbum(album.id, { is_shared: !shared });
    await db.albums.put(updated);
    await syncFromServer().catch(console.error);
  }

  return (
    <GalleryView
      filter={{ album_id: id ?? null }}
      title={album?.name ?? "Album"}
      subtitle={
        !album
          ? "a curated collection"
          : !mine
            ? `${displayNameFor(album.owner_id)}'s album`
            : shared && partner
              ? `shared with ${partner.display_name}`
              : "a curated collection"
      }
      emptyKind="album"
      emptyTitle="empty album"
      emptySub="upload straight in, or hit Select on any timeline to file pictures you already have."
      uploadAlbumId={id ?? null}
      rightSlot={
        mine && partner ? (
          <button
            type="button"
            onClick={toggleShare}
            aria-pressed={shared}
            className={`btn inline-flex items-center gap-1.5 ${shared ? "btn-primary" : ""}`}
          >
            <Users className="w-4 h-4" />
            {shared ? "Shared" : "Share"}
          </button>
        ) : null
      }
    />
  );
}
