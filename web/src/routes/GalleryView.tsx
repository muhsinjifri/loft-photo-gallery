import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckSquare, FolderPlus, X } from "lucide-react";
import type { Photo } from "@loft/shared";
import type { PhotoFilter } from "../filter";
import { MasonryGrid } from "../components/MasonryGrid";
import { Viewer } from "../components/Viewer";
import { UploadButton } from "../components/Upload";
import { EmptyState } from "../components/EmptyState";
import { AlbumPicker } from "../components/AlbumPicker";
import { useUser } from "../user";

interface Props {
  filter: PhotoFilter;
  title: string;
  subtitle?: string;
  emptyKind?:
    | "photos"
    | "album"
    | "trash"
    | "month"
    | "albums"
    | "offline"
    | "upload";
  emptyTitle?: string;
  emptySub?: string;
  rightSlot?: ReactNode;
  hideUpload?: boolean;
  uploadAlbumId?: string | null;
}

export function GalleryView({
  filter,
  title,
  subtitle,
  emptyKind = "photos",
  emptyTitle,
  emptySub,
  rightSlot,
  hideUpload = false,
  uploadAlbumId = null,
}: Props) {
  const [open, setOpen] = useState<{ photos: Photo[]; index: number } | null>(null);
  const { me } = useUser();

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  // Kept in a ref, not state: it's only read inside callbacks, and storing the
  // visible list in state would loop with MasonryGrid's onPhotosChange.
  const visibleRef = useRef<Photo[]>([]);
  const lastIndexRef = useRef<number | null>(null);

  const onPhotosChange = useCallback((rows: Photo[]) => {
    visibleRef.current = rows;
  }, []);

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    lastIndexRef.current = null;
  }, []);

  useEffect(() => {
    if (!selectMode) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "Escape") exitSelect();
      if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSelected(
          new Set(visibleRef.current.filter((p) => p.owner_id === me?.id).map((p) => p.id)),
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, exitSelect, me?.id]);

  const toggleSelect = useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      // Read the anchor BEFORE queueing the update and capture it in the closure.
      // setSelected's updater runs at render time, not synchronously, so if the
      // ref were read inside it we'd have already overwritten it below and every
      // shift-click would collapse to `last === index` — i.e. a plain toggle.
      const last = lastIndexRef.current;
      lastIndexRef.current = index;
      setSelected((prev) => {
        const next = new Set(prev);
        if (shiftKey && last !== null && last !== index) {
          // Range select: everything between the two tiles that is actually mine.
          const [lo, hi] = last < index ? [last, index] : [index, last];
          for (let i = lo; i <= hi; i++) {
            const p = visibleRef.current[i];
            if (p && p.owner_id === me?.id) next.add(p.id);
          }
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [me?.id],
  );

  // Offer "remove from album" only when everything selected already shares one.
  const selectedIds = Array.from(selected);
  const commonAlbumId = (() => {
    const rows = visibleRef.current.filter((p) => selected.has(p.id));
    if (rows.length === 0) return null;
    const first = rows[0].album_id;
    return rows.every((p) => p.album_id === first) ? first : null;
  })();

  const canSelect = !filter.trash;

  return (
    <>
      <header className="flex items-end justify-between gap-4 pb-3 mb-4 hairline-b">
        <div className="min-w-0">
          <h2 className="font-display text-large font-bold m-0 text-ink truncate">{title}</h2>
          {subtitle && <span className="block mt-0.5 text-footnote text-ink-fade">{subtitle}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!selectMode && rightSlot}
          {canSelect &&
            (selectMode ? (
              <button type="button" className="btn inline-flex items-center gap-1.5" onClick={exitSelect}>
                <X className="w-4 h-4" /> Done
              </button>
            ) : (
              <button
                type="button"
                className="btn inline-flex items-center gap-1.5"
                onClick={() => setSelectMode(true)}
              >
                <CheckSquare className="w-4 h-4" /> Select
              </button>
            ))}
          {!hideUpload && !selectMode && (
            <span className="hidden md:inline-flex">
              <UploadButton albumId={uploadAlbumId} />
            </span>
          )}
        </div>
      </header>

      <MasonryGrid
        filter={filter}
        selectMode={selectMode}
        selected={selected}
        onToggleSelect={toggleSelect}
        onPhotosChange={onPhotosChange}
        onOpen={(photos, index) => setOpen({ photos, index })}
        empty={
          <EmptyState
            kind={emptyKind}
            title={emptyTitle ?? "nothing here yet"}
            sub={emptySub}
          />
        }
      />

      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="material fixed z-[90] left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 flex items-center gap-3 rounded-xl border border-line px-2.5 py-2 shadow-lift"
          >
            <span className="text-footnote text-ink-soft pl-1.5 whitespace-nowrap tabular-nums">
              {selected.size === 0
                ? "select pictures"
                : `${selected.size} selected`}
            </span>
            <button
              type="button"
              className="btn btn-primary inline-flex items-center gap-1.5"
              disabled={selected.size === 0}
              onClick={() => setPickerOpen(true)}
            >
              <FolderPlus className="w-4 h-4" /> Add to album
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AlbumPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        photoIds={selectedIds}
        currentAlbumId={commonAlbumId}
        onDone={exitSelect}
      />

      {open && (
        <Viewer
          photos={open.photos}
          index={open.index}
          onIndexChange={(i) => setOpen((o) => (o ? { ...o, index: i } : o))}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
