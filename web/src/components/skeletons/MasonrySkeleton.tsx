const RATIOS = [3 / 4, 1, 4 / 3, 2 / 3, 1, 4 / 5, 3 / 4, 1, 5 / 4];

function Tile({ ratio, delay }: { ratio: number; delay: number }) {
  return (
    <div
      className="rounded bg-paper-deep animate-shimmer"
      style={{ aspectRatio: ratio, animationDelay: `${delay}ms` }}
    />
  );
}

export function MasonrySkeleton({ count = 18 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Tile key={i} ratio={RATIOS[i % RATIOS.length]} delay={(i % 6) * 80} />
      ))}
    </div>
  );
}
