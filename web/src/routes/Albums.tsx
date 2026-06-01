import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { db } from "../db";
import { api, imgUrl, cacheVer } from "../api";
import { EmptyState } from "../components/EmptyState";
import { AlbumListSkeleton } from "../components/skeletons";
import { Underline } from "../components/flourishes";

export function Albums() {
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const albums = useLiveQuery(
    () => db.albums.orderBy("created_at").reverse().toArray(),
    [],
  );

  const albumStats = useLiveQuery(async () => {
    if (!albums?.length) return new Map<string, { count: number; cover?: string; coverVer?: number | null }>();
    const map = new Map<string, { count: number; cover?: string; coverVer?: number | null }>();
    for (const a of albums) {
      const photos = await db.photos
        .filter((p) => p.album_id === a.id && !p.deleted_at)
        .toArray();
      photos.sort((x, y) => (y.taken_at ?? y.uploaded_at) - (x.taken_at ?? x.uploaded_at));
      map.set(a.id, {
        count: photos.length,
        cover: photos[0]?.id,
        coverVer: photos[0] ? cacheVer(photos[0]) ?? null : null,
      });
    }
    return map;
  }, [albums?.length]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { album } = await api.createAlbum(name.trim());
      await db.albums.put(album);
      setName("");
      setNewOpen(false);
    } finally {
      setCreating(false);
    }
  }

  const Header = (
    <header className="relative flex items-end justify-between gap-4 pb-4 mb-5">
      <div className="min-w-0">
        <h2 className="font-serif text-3xl sm:text-4xl m-0 text-ink -tracking-[0.015em] leading-[1.1]">
          Albums
        </h2>
        <span className="block mt-1 font-serif italic text-[13.5px] text-ink-fade">
          collections you've gathered
        </span>
      </div>
      <button
        type="button"
        onClick={() => setNewOpen(true)}
        className="btn btn-primary inline-flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> New album
      </button>
      <span className="absolute -bottom-[3px] right-0 w-1.5 h-1.5 rounded-full bg-highlight" />
      <Underline className="block absolute -bottom-[5px] inset-x-0 w-full h-1.5 text-accent/50" />
    </header>
  );

  return (
    <>
      {Header}

      {!albums ? (
        <AlbumListSkeleton count={6} />
      ) : albums.length === 0 ? (
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {albums.map((a, i) => {
            const stats = albumStats?.get(a.id);
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.04 }}
              >
                <Link
                  to={`/a/${a.id}`}
                  className="tile block aspect-[4/5] relative no-underline"
                  style={{ background: "var(--c-paper, #EDE5D6)" }}
                >
                  {stats?.cover ? (
                    <img
                      src={imgUrl.thumb(stats.cover, stats.coverVer)}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-ink-trace italic font-serif text-sm">
                      empty
                    </div>
                  )}
                  <div
                    className="absolute inset-x-0 bottom-0 p-3 text-paper-tint"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(20,16,12,0.72), rgba(20,16,12,0))",
                    }}
                  >
                    <p className="m-0 font-serif text-[15px] font-medium truncate">{a.name}</p>
                    <p className="m-0 text-[11.5px] italic text-paper-tint/75">
                      {stats?.count ?? 0} {stats?.count === 1 ? "picture" : "pictures"}
                    </p>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

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
                <Dialog.Description className="font-serif italic text-[13.5px] text-ink-fade m-0">
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
              className="w-full rounded border border-line-strong bg-paper-tint px-3 py-2 font-serif text-[15px] text-ink outline-none focus:border-accent transition-colors"
            />
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
