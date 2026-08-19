import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { motion } from "framer-motion";
import { Plus, X, Users, MoreHorizontal, Trash2 } from "lucide-react";
import type { Album, Photo } from "@loft/shared";
import { db } from "../db";
import { api, imgUrl, cacheVer } from "../api";
import { syncFromServer } from "../sync";
import { useUser } from "../user";
import { EmptyState } from "../components/EmptyState";
import { AlbumListSkeleton } from "../components/skeletons";

interface AlbumCard {
  album: Album;
  count: number;
  /** How many of the pictures in here belong to the other person. */
  theirs: number;
  cover?: string;
  coverVer?: number | null;
}

export function Albums() {
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [shareNew, setShareNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const { me, partner, displayNameFor } = useUser();

  // One live query over both tables instead of an album list plus a full
  // db.photos scan per album. The old version also keyed on [albums?.length],
  // so counts went stale whenever a photo moved between albums without changing
  // how many albums there were; with no deps, Dexie's own observability
  // invalidates this correctly.
  const cards = useLiveQuery(async (): Promise<AlbumCard[]> => {
    const list = await db.albums.orderBy("created_at").reverse().toArray();
    if (!list.length) return [];

    const photos = await db.photos.filter((p) => !p.deleted_at && !!p.album_id).toArray();
    photos.sort((x, y) => (y.taken_at ?? y.uploaded_at) - (x.taken_at ?? x.uploaded_at));

    const byAlbum = new Map<string, Photo[]>();
    for (const p of photos) {
      const arr = byAlbum.get(p.album_id!);
      if (arr) arr.push(p);
      else byAlbum.set(p.album_id!, [p]);
    }

    return list.map((album) => {
      const ps = byAlbum.get(album.id) ?? [];
      return {
        album,
        count: ps.length,
        theirs: ps.filter((p) => p.owner_id !== me?.id).length,
        cover: ps[0]?.id,
        coverVer: ps[0] ? (cacheVer(ps[0]) ?? null) : null,
      };
    });
    // `theirs` reads me.id, so the query must re-run when identity resolves.
  }, [me?.id]);

  const [confirmDelete, setConfirmDelete] = useState<AlbumCard | null>(null);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { album } = await api.createAlbum(name.trim(), shareNew);
      await db.albums.put(album);
      setName("");
      setShareNew(false);
      setNewOpen(false);
    } finally {
      setCreating(false);
    }
  }

  async function reallyDelete(card: AlbumCard) {
    await api.deleteAlbum(card.album.id);
    await db.albums.delete(card.album.id);
    setConfirmDelete(null);
    // The photos are unfiled rather than deleted, so pull their new album_id
    // down now instead of leaving the grid wrong for up to a minute.
    await syncFromServer().catch(console.error);
  }

  async function toggleShare(album: Album) {
    const { album: updated } = await api.updateAlbum(album.id, { is_shared: album.is_shared !== 1 });
    await db.albums.put(updated);
    // Un-sharing makes the album's photos invisible to the partner, and sharing
    // makes them visible. Reconcile now rather than leaving the mirror wrong for
    // up to a minute.
    await syncFromServer().catch(console.error);
  }

  const Header = (
    <header className="flex items-end justify-between gap-4 pb-3 mb-4 hairline-b">
      <div className="min-w-0">
        <h2 className="font-display text-large font-bold m-0 text-ink">Albums</h2>
        <span className="block mt-0.5 text-footnote text-ink-fade">collections you've gathered</span>
      </div>
      <button
        type="button"
        onClick={() => setNewOpen(true)}
        className="btn btn-primary inline-flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> New album
      </button>
    </header>
  );

  return (
    <>
      {Header}

      {!cards ? (
        <AlbumListSkeleton count={6} />
      ) : cards.length === 0 ? (
        <EmptyState
          kind="albums"
          title="no albums yet"
          sub="group memories into collections."
          action={
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="btn btn-primary inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create your first
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-5">
          {cards!.map(({ album: a, ...stats }, i) => {
            const mine = a.owner_id === me?.id;
            return (
              <motion.div
                key={a.id}
                className="group relative"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.04 }}
              >
                {/* Photos puts the album's name under its cover, not over it:
                    nothing obscures the picture, and the titles line up into a
                    readable column. */}
                <Link to={`/a/${a.id}`} className="block no-underline">
                  <span className="tile block aspect-square relative !rounded-lg">
                    {stats?.cover ? (
                      <img
                        src={imgUrl.thumb(stats.cover, stats.coverVer)}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-ink-trace text-footnote">
                        empty
                      </span>
                    )}
                    {a.is_shared === 1 && (
                      <span
                        className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-[3px] rounded-pill text-[10.5px] font-medium text-white"
                        style={{ background: "rgb(0 0 0 / 0.5)", backdropFilter: "blur(8px)" }}
                      >
                        <Users className="w-2.5 h-2.5" /> Shared
                      </span>
                    )}
                  </span>
                  <span className="block mt-2 px-0.5">
                    <span className="block text-footnote font-medium text-ink truncate">{a.name}</span>
                    <span className="block text-caption text-ink-fade tabular-nums">
                      {stats.count} {stats.count === 1 ? "picture" : "pictures"}
                      {!mine && ` · ${displayNameFor(a.owner_id)}`}
                    </span>
                  </span>
                </Link>

                {/* Only the owner controls sharing — you can add your photos to
                    the other person's shared album, but you can't re-share it. */}
                {mine && (
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        aria-label={`Options for ${a.name}`}
                        className="absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-full text-ink backdrop-blur-md opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                        style={{ background: "rgb(var(--scrim) / 0.6)" }}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className="z-[120] paper-card !p-1 min-w-[200px]"
                      >
                        {partner && (
                        <DropdownMenu.Item
                          onSelect={() => void toggleShare(a)}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[13.5px] text-ink outline-none cursor-pointer data-[highlighted]:bg-accent/10"
                        >
                          <Users className="w-3.5 h-3.5" />
                          {a.is_shared === 1
                            ? "Stop sharing"
                            : `Share with ${partner?.display_name ?? "them"}`}
                        </DropdownMenu.Item>
                        )}
                        {partner && <DropdownMenu.Separator className="h-px my-1 bg-line" />}
                        <DropdownMenu.Item
                          onSelect={() => setConfirmDelete(cards!.find((x) => x.album.id === a.id)!)}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[13.5px] text-red-500 outline-none cursor-pointer data-[highlighted]:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete album
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <AlertDialog.Root open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[160] bg-black/40 animate-fadeIn" />
          <AlertDialog.Content
            className="fixed z-[161] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 paper-card w-[min(400px,calc(100vw-32px))]"
            style={{ animation: "liftIn .26s cubic-bezier(.32,.72,0,1)" }}
          >
            <AlertDialog.Title className="font-display text-title3 font-semibold text-ink m-0">
              Delete “{confirmDelete?.album.name}”?
            </AlertDialog.Title>
            <AlertDialog.Description className="text-footnote text-ink-fade mt-1 mb-4">
              {confirmDelete?.count
                ? `The ${confirmDelete.count} ${confirmDelete.count === 1 ? "picture" : "pictures"} in it stay in your library — they just won't be in an album any more.`
                : "This album is empty."}
              {!!confirmDelete?.theirs && partner && (
                <>
                  {" "}
                  {confirmDelete.theirs} of them{" "}
                  {confirmDelete.theirs === 1 ? "is" : "are"} {partner.display_name}'s and will be
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
                onClick={() => confirmDelete && void reallyDelete(confirmDelete)}
              >
                Delete album
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <Dialog.Root open={newOpen} onOpenChange={setNewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-ink/40 animate-fadeIn" />
          <Dialog.Content
            className="fixed z-[101] left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 paper-card w-[min(420px,calc(100vw-32px))]"
            style={{ animation: "liftIn .2s cubic-bezier(.2,.7,.2,1)" }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <Dialog.Title className="font-display text-3xl text-ink m-0">
                  New album
                </Dialog.Title>
                <Dialog.Description className="text-[13.5px] text-ink-fade m-0">
                  give this collection a name.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-icon" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
              placeholder="trip to the coast"
              autoFocus
              className="w-full rounded border border-line-strong bg-paper-tint px-3 py-2 text-[15px] text-ink outline-none focus:border-accent transition-colors"
            />
            {partner && (
              <label className="flex items-center gap-2 mt-3 text-[13.5px] text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareNew}
                  onChange={(e) => setShareNew(e.target.checked)}
                  className="accent-accent"
                />
                share with {partner.display_name}
              </label>
            )}
            <div className="flex items-center justify-end gap-2 mt-4">
              <Dialog.Close asChild>
                <button type="button" className="btn">Cancel</button>
              </Dialog.Close>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!name.trim() || creating}
                onClick={create}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
