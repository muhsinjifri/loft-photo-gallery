import type { ReactNode } from "react";
import {
  NoPhotos,
  EmptyAlbum,
  EmptyTrash,
  EmptyMonth,
  NoAlbums,
  OfflineState,
  UploadDropHint,
} from "./illustrations";

const KINDS = {
  photos: NoPhotos,
  album: EmptyAlbum,
  trash: EmptyTrash,
  month: EmptyMonth,
  albums: NoAlbums,
  offline: OfflineState,
  upload: UploadDropHint,
} as const;

type Kind = keyof typeof KINDS;

type Props = {
  kind: Kind;
  title: string;
  sub?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ kind, title, sub, action, className }: Props) {
  const Illustration = KINDS[kind];
  return (
    <div
      className={`flex flex-col items-center text-center px-4 py-16 sm:py-24 text-ink-fade ${className ?? ""}`}
    >
      <Illustration className="w-20 h-20 mb-4 text-ink-trace opacity-70" />
      <h3 className="font-display text-title3 text-ink font-semibold m-0 mb-1">
        {title}
      </h3>
      {sub && <p className="text-sm text-ink-fade m-0 max-w-xs">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
