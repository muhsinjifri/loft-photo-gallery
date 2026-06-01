import { useLiveQuery } from "dexie-react-hooks";
import { Masonry } from "masonic";
import { motion } from "framer-motion";
import { Film } from "lucide-react";
import type { Photo } from "@loft/shared";
import { db } from "../db";
import { imgUrl, cacheVer } from "../api";
import { useColumnCount } from "../hooks/useColumnCount";
import { MasonrySkeleton } from "./skeletons";

interface Props {
  filter: { album_id?: string | null; year_month?: string | null; trash?: boolean };
  onOpen: (photos: Photo[], index: number) => void;
  empty?: React.ReactNode;
}

const DEFAULT_RATIO = 1;

function aspect(p: Photo): number {
  if (!p.width || !p.height || p.width <= 0 || p.height <= 0) return DEFAULT_RATIO;
  return p.width / p.height;
}

function MasonryCard({
  data,
  width,
  onOpen,
}: {
  data: { photo: Photo; index: number };
  width: number;
  onOpen: () => void;
}) {
  const { photo } = data;
  const ratio = aspect(photo);
  const height = Math.max(80, Math.round(width / ratio));
  const stagger = Math.min(data.index, 24) * 22;
  return (
    <motion.button
      type="button"
      layoutId={`photo-${photo.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1], delay: stagger / 1000 }}
      onClick={onOpen}
      className="tile block w-full text-left p-0 border-0 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      style={{ height, background: "var(--c-paper, #EDE5D6)" }}
      aria-label={photo.filename}
    >
      <img
        src={imgUrl.thumb(photo.id, cacheVer(photo))}
        alt={photo.filename}
        loading="lazy"
        className="w-full h-full object-cover block"
        style={{ filter: "saturate(1.02)" }}
      />
      {photo.duration_ms ? (
        <span
          className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[10.5px] font-medium tracking-wide text-paper-tint backdrop-blur-md"
          style={{ background: "rgba(42,38,32,0.78)" }}
        >
          <Film className="w-2.5 h-2.5" />
          {Math.round(photo.duration_ms / 1000)}s
        </span>
      ) : null}
    </motion.button>
  );
}

export function MasonryGrid({ filter, onOpen, empty }: Props) {
  const photos = useLiveQuery(async () => {
    const rows = await db.photos
      .filter((p) => {
        if (filter.trash) {
          if (!p.deleted_at) return false;
        } else {
          if (p.deleted_at) return false;
        }
        if (filter.album_id !== undefined && filter.album_id !== null) {
          if (p.album_id !== filter.album_id) return false;
        }
        if (filter.year_month) {
          if (p.year_month !== filter.year_month) return false;
        }
        return true;
      })
      .toArray();
    rows.sort((a, b) => (b.taken_at ?? b.uploaded_at) - (a.taken_at ?? a.uploaded_at));
    return rows;
  }, [filter.album_id, filter.year_month, filter.trash]);

  const columnCount = useColumnCount();

  if (!photos) {
    return <MasonrySkeleton count={18} />;
  }
  if (photos.length === 0) {
    return <>{empty}</>;
  }

  const items = photos.map((photo, index) => ({ photo, index }));

  return (
    <Masonry
      // Remount when column count changes so positions recalc cleanly
      key={`m-${columnCount}-${photos.length}`}
      items={items}
      columnCount={columnCount}
      columnGutter={columnCount <= 2 ? 8 : 12}
      rowGutter={columnCount <= 2 ? 8 : 12}
      overscanBy={2}
      render={({ data, width }) => (
        <MasonryCard
          data={data}
          width={width}
          onOpen={() => onOpen(photos, data.index)}
        />
      )}
    />
  );
}
