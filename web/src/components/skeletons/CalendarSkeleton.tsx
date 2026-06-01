export function CalendarSkeleton() {
  return (
    <div className="space-y-10">
      {[0, 1].map((y) => (
        <section key={y}>
          <div
            className="h-8 w-24 rounded bg-paper-deep animate-shimmer mb-4"
            style={{ animationDelay: `${y * 100}ms` }}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 6 + y * 2 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] rounded bg-paper-deep animate-shimmer"
                style={{ animationDelay: `${(y * 6 + i) * 60}ms` }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
