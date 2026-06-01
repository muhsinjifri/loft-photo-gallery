export function AlbumListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-6 rounded-pill bg-paper-deep animate-shimmer"
          style={{ width: `${60 + ((i * 13) % 35)}%`, animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}
