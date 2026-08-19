import { useEffect, useRef, useState } from "react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Users, Trash2 } from "lucide-react";
import { db } from "../db";
import { api } from "../api";
import { syncFromServer } from "../sync";
import { useUser } from "../user";
import { GalleryView } from "./GalleryView";

export function AlbumDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  // Counted here so the warning can name what happens to the other person's
  // pictures before anything is destroyed.
  const contents = useLiveQuery(
    async () =>
      id ? await db.photos.filter((p) => p.album_id === id && !p.deleted_at).toArray() : [],
    [id],
  );
  const total = contents?.length ?? 0;
  const theirs = contents?.filter((p) => p.owner_id !== me?.id).length ?? 0;

  async function reallyDelete() {
    if (!album) return;
    await api.deleteAlbum(album.id);
    await db.albums.delete(album.id);
    setConfirmDelete(false);
    navigate("/albums", { replace: true });
    // The pictures are unfiled, not deleted — refresh so their new album_id lands.
    await syncFromServer().catch(console.error);
  }

  async function toggleShare() {
    if (!album) return;
    const { album: updated } = await api.updateAlbum(album.id, { is_shared: !shared });
    await db.albums.put(updated);
    await syncFromServer().catch(console.error);
  }

  return (
    <>
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
        mine ? (
          <>
            {partner && (
              <button
                type="button"
                onClick={toggleShare}
                aria-pressed={shared}
                className={`btn inline-flex items-center gap-1.5 ${shared ? "btn-primary" : ""}`}
              >
                <Users className="w-4 h-4" />
                {shared ? "Shared" : "Share"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete album"
              className="btn btn-icon"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        ) : null
      }
    />

    <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[160] bg-black/40 animate-fadeIn" />
        <AlertDialog.Content
          className="fixed z-[161] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 paper-card w-[min(400px,calc(100vw-32px))]"
          style={{ animation: "liftIn .26s cubic-bezier(.32,.72,0,1)" }}
        >
          <AlertDialog.Title className="font-display text-title3 font-semibold text-ink m-0">
            Delete “{album?.name}”?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-footnote text-ink-fade mt-1 mb-4">
            {total
              ? `The ${total} ${total === 1 ? "picture" : "pictures"} in it stay in your library — they just won't be in an album any more.`
              : "This album is empty."}
            {!!theirs && partner && (
              <>
                {" "}
                {theirs} of them {theirs === 1 ? "is" : "are"} {partner.display_name}'s and will be
                removed from this album too. Nothing of theirs is deleted.
              </>
            )}
          </AlertDialog.Description>
          <div className="flex items-center justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button type="button" className="btn">Cancel</button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className="btn"
              style={{ background: "rgb(255 59 48)", borderColor: "transparent", color: "#fff" }}
              onClick={() => void reallyDelete()}
            >
              Delete album
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    </>
  );
}
