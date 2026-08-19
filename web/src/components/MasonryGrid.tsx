import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Masonry } from "masonic";
import { motion } from "framer-motion";
import { Check, Film } from "lucide-react";
import type { Photo } from "@loft/shared";
import { imgUrl, cacheVer } from "../api";
import { useUser } from "../user";
import { queryPhotos, type PhotoFilter } from "../filter";
import { useColumnCount } from "../hooks/useColumnCount";
import { MasonrySkeleton } from "./skeletons";

interface Props {
  filter: PhotoFilter;
  onOpen: (photos: Photo[], index: number) => void;
  empty?: React.ReactNode;
  selectMode?: boolean;
  selected?: Set<string>;
  /** shiftKey lets the grid extend a range from the last tile touched. */
  onToggleSelect?: (id: string, index: number, shiftKey: boolean) => void;
  /** Reports the visible photos so the parent can drive select-all / range logic. */
  onPhotosChange?: (photos: Photo[]) => void;
}

interface CardData {
  photo: Photo;
  index: number;
  /** Set when the tile belongs to the other resident, so it can be attributed at a glance. */
  ownerInitial?: string;
  /** Filing is owner-only, so the partner's tiles are inert in select mode. */
  selectable: boolean;
  selectMode: boolean;
  checked: boolean;
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
  onToggle,
}: {
  data: CardData;
  width: number;
  onOpen: () => void;
  onToggle: (shiftKey: boolean) => void;
}) {
  const { photo, selectMode, selectable, checked } = data;
  const inert = selectMode && !selectable;
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
      onClick={(e) => (selectMode ? onToggle(e.shiftKey) : onOpen())}
      disabled={inert}
      aria-pressed={selectMode ? checked : undefined}
      className={`tile block w-full text-left p-0 border-0 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
        inert ? "cursor-default" : ""
      }`}
      style={{ height }}
      aria-label={photo.filename}
      title={inert ? "only its owner can file this one" : undefined}
    >
      <img
        src={imgUrl.thumb(photo.id, cacheVer(photo))}
        alt={photo.filename}
        loading="lazy"
        className="w-full h-full object-cover block"
        style={{
          filter: "saturate(1.02)",
          opacity: inert ? 0.4 : 1,
          transform: checked ? "scale(.93)" : "none",
          transition: "transform .2s cubic-bezier(.32,.72,0,1), opacity .15s",
        }}
      />
      {selectMode && selectable && (
        <>
          <span
            aria-hidden
            className="absolute bottom-1.5 right-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center transition-colors"
            style={{
              background: checked ? "rgb(var(--accent))" : "rgb(0 0 0 / 0.28)",
              boxShadow: checked ? "none" : "inset 0 0 0 1.5px rgb(255 255 255 / 0.9)",
              backdropFilter: checked ? "none" : "blur(4px)",
            }}
          >
            {checked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
          </span>
        </>
      )}
      {data.ownerInitial ? (
        <span
          className="absolute bottom-2 left-2 flex items-center justify-center w-5 h-5 rounded-full text-[10.5px] font-medium text-ink backdrop-blur-md"
          style={{ background: "rgb(var(--scrim) / 0.72)", backdropFilter: "blur(6px)" }}
          title={`added by ${data.ownerInitial}`}
        >
          {data.ownerInitial}
        </span>
      ) : null}
      {photo.duration_ms ? (
        <span
          className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-pill text-[10.5px] font-medium tracking-wide text-ink backdrop-blur-md"
          style={{ background: "rgb(var(--scrim) / 0.72)", backdropFilter: "blur(6px)" }}
        >
          <Film className="w-2.5 h-2.5" />
          {Math.round(photo.duration_ms / 1000)}s
        </span>
      ) : null}
    </motion.button>
  );
}

export function MasonryGrid({
  filter,
  onOpen,
  empty,
  selectMode = false,
  selected,
  onToggleSelect,
  onPhotosChange,
}: Props) {
  const { me, displayNameFor } = useUser();
  const meId = me?.id ?? "";
  const photos = useLiveQuery(
    async () => (meId ? queryPhotos(filter, meId) : []),
    [filter.album_id, filter.year_month, filter.trash, filter.scope, meId],
  );

  const columnCount = useColumnCount();

  useEffect(() => {
    if (photos) onPhotosChange?.(photos);
  }, [photos, onPhotosChange]);

  if (!photos) {
    return <MasonrySkeleton count={18} />;
  }
  if (photos.length === 0) {
    return <>{empty}</>;
  }

  // Resolved here rather than with a useUser() call inside each cell: masonic
  // re-renders cells aggressively, so a context read per tile is wasted work.
  const items: CardData[] = photos.map((photo, index) => ({
    photo,
    index,
    ownerInitial:
      photo.owner_id && photo.owner_id !== meId
        ? (displayNameFor(photo.owner_id)[0] ?? "?").toUpperCase()
        : undefined,
    selectable: photo.owner_id === meId,
    selectMode,
    checked: !!selected?.has(photo.id),
  }));

  return (
    <Masonry
      // Remount on column count AND scope: flipping scope can land on an
      // identical photo count with entirely different contents, which would
      // otherwise leave masonic reusing stale per-item heights.
      key={`m-${columnCount}-${filter.scope ?? "mine"}-${photos.length}`}
      // `selected`/`selectMode` deliberately stay OUT of the key: remounting on
      // every checkbox click would reset masonic's measured layout mid-selection.
      items={items}
      columnCount={columnCount}
      columnGutter={columnCount <= 2 ? 3 : 5}
      rowGutter={columnCount <= 2 ? 3 : 5}
      overscanBy={2}
      render={({ data, width }) => (
        <MasonryCard
          data={data}
          width={width}
          onOpen={() => onOpen(photos, data.index)}
          onToggle={(shiftKey) => onToggleSelect?.(data.photo.id, data.index, shiftKey)}
        />
      )}
    />
  );
}
