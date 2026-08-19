import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, FolderOpen, Plus, Users, X } from "lucide-react";
import { db } from "../db";
import { api } from "../api";
import { useUser } from "../user";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The photos being filed. All must belong to the current user — the server skips any that don't. */
  photoIds: string[];
  /** Current album, when every selected photo already shares one. Enables "remove from album". */
  currentAlbumId?: string | null;
  onDone?: (albumId: string | null) => void;
}

export function AlbumPicker({ open, onOpenChange, photoIds, currentAlbumId, onDone }: Props) {
  const { me, displayNameFor } = useUser();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const albums = useLiveQuery(() => db.albums.orderBy("created_at").reverse().toArray(), []);

  // You can file into your own albums and into a shared one, which is exactly
  // what the server accepts (getUsableAlbum). Nothing else is offered, so the
  // picker can never produce a request the server will reject.
  const options = useMemo(
    () => (albums ?? []).filter((a) => a.owner_id === me?.id || a.is_shared === 1),
    [albums, me?.id],
  );

  async function apply(albumId: string | null) {
    if (busy || photoIds.length === 0) return;
    setBusy(true);
    try {
      const { photos } = await api.setAlbumBulk(photoIds, albumId);
      if (photos.length) await db.photos.bulkPut(photos);
      onDone?.(albumId);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function createAndApply() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const { album } = await api.createAlbum(name);
      await db.albums.put(album);
      const { photos } = await api.setAlbumBulk(photoIds, album.id);
      if (photos.length) await db.photos.bulkPut(photos);
      setNewName("");
      setCreating(false);
      onDone?.(album.id);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const count = photoIds.length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/40 animate-fadeIn" style={{ backdropFilter: "blur(4px)" }} />
        <Dialog.Content
          className="fixed z-[151] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 paper-card !p-0 overflow-hidden w-[min(400px,calc(100vw-32px))]"
          style={{ animation: "liftIn .26s cubic-bezier(.32,.72,0,1)" }}
        >
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
            <div>
              <Dialog.Title className="font-display text-title3 font-semibold text-ink m-0">
                {creating ? "New album" : "Add to album"}
              </Dialog.Title>
              <Dialog.Description className="text-footnote text-ink-fade m-0">
                {creating
                  ? `it'll start with ${count === 1 ? "this picture" : `these ${count} pictures`}.`
                  : `filing ${count === 1 ? "1 picture" : `${count} pictures`}.`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="btn btn-icon" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {creating ? (
            <>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createAndApply();
                }}
                placeholder="trip to the coast"
                autoFocus
                className="w-full mx-4 rounded-md border border-line-strong bg-paper px-3 py-2 text-body text-ink outline-none focus:border-accent transition-colors" style={{ width: "calc(100% - 2rem)" }}
              />
              <div className="flex items-center justify-end gap-2 px-4 py-3 mt-2">
                <button type="button" className="btn" onClick={() => setCreating(false)} disabled={busy}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!newName.trim() || busy}
                  onClick={createAndApply}
                >
                  {busy ? "Creating…" : "Create & add"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="max-h-[46vh] overflow-y-auto px-2 pb-1">
                {options.length === 0 ? (
                  <p className="text-[13.5px] text-ink-fade m-0 py-2">
                    no albums yet — make one below.
                  </p>
                ) : (
                  <ul className="list-none m-0 p-0 space-y-0.5">
                    {options.map((a) => {
                      const here = a.id === currentAlbumId;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            disabled={busy || here}
                            onClick={() => apply(a.id)}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-left text-[14.5px] transition-colors ${
                              here
                                ? "text-ink-fade cursor-default"
                                : "text-ink-soft hover:text-ink hover:bg-accent/[0.08]"
                            }`}
                          >
                            <FolderOpen className="w-4 h-4 shrink-0 text-ink-fade" />
                            <span className="truncate flex-1">{a.name}</span>
                            {a.is_shared === 1 && (
                              <Users className="w-3.5 h-3.5 shrink-0 text-ink-fade" aria-label="shared" />
                            )}
                            {a.owner_id !== me?.id && (
                              <span className="text-[11.5px] text-ink-fade shrink-0">
                                {displayNameFor(a.owner_id)}
                              </span>
                            )}
                            {here && <Check className="w-4 h-4 shrink-0 text-accent" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 px-3 py-3 hairline-b" style={{ boxShadow: "inset 0 1px 0 0 rgb(var(--line) / var(--line-a))" }}>
                <button
                  type="button"
                  className="btn inline-flex items-center gap-1.5"
                  onClick={() => setCreating(true)}
                  disabled={busy}
                >
                  <Plus className="w-4 h-4" /> New album
                </button>
                {currentAlbumId ? (
                  <button type="button" className="btn" onClick={() => apply(null)} disabled={busy}>
                    Remove from album
                  </button>
                ) : null}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
