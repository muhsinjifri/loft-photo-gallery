import { useState, type ReactNode } from "react";
import type { Photo } from "@loft/shared";
import { MasonryGrid } from "../components/MasonryGrid";
import { Viewer } from "../components/Viewer";
import { UploadButton } from "../components/Upload";
import { EmptyState } from "../components/EmptyState";
import { Underline } from "../components/flourishes";

interface Props {
  filter: { album_id?: string | null; year_month?: string | null; trash?: boolean };
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

  return (
    <>
      <header className="relative flex items-end justify-between gap-4 pb-4 mb-5">
        <div className="min-w-0">
          <h2 className="font-serif text-3xl sm:text-4xl m-0 text-ink -tracking-[0.015em] leading-[1.1] truncate">
            {title}
          </h2>
          {subtitle && (
            <span className="block mt-1 font-serif italic text-[13.5px] text-ink-fade">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rightSlot}
          {!hideUpload && (
            <span className="hidden md:inline-flex">
              <UploadButton albumId={uploadAlbumId} />
            </span>
          )}
        </div>
        <span className="absolute -bottom-[3px] right-0 w-1.5 h-1.5 rounded-full bg-highlight" />
        <Underline className="block absolute -bottom-[5px] inset-x-0 w-full h-1.5 text-accent/50" />
      </header>

      <MasonryGrid
        filter={filter}
        onOpen={(photos, index) => setOpen({ photos, index })}
        empty={
          <EmptyState
            kind={emptyKind}
            title={emptyTitle ?? "nothing here yet"}
            sub={emptySub}
          />
        }
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
