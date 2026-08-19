import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "framer-motion";
import { imgUrl, cacheVer } from "../api";
import { queryPhotos } from "../filter";
import { useScope } from "../scope";
import { useUser } from "../user";
import { ScopeToggle } from "../components/ScopeToggle";
import { EmptyState } from "../components/EmptyState";
import { CalendarSkeleton } from "../components/skeletons";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface MonthBucket {
  ym: string;
  year: number;
  monthIdx: number;
  count: number;
  cover: string | null;
  coverVer: number | null;
}

export function Calendar() {
  const { scope } = useScope();
  const { me } = useUser();
  // Shares queryPhotos with MasonryGrid so the calendar and the grid can never
  // disagree about what "Mine" and "Ours" mean.
  const buckets = useLiveQuery(async (): Promise<MonthBucket[]> => {
    if (!me) return [];
    const photos = await queryPhotos({ scope }, me.id);
    const m = new Map<string, MonthBucket>();
    for (const p of photos) {
      if (!p.year_month) continue;
      const ym = p.year_month;
      const [y, mo] = ym.split("-");
      const year = Number(y);
      const monthIdx = Number(mo) - 1;
      const b = m.get(ym);
      if (!b) {
        m.set(ym, { ym, year, monthIdx, count: 1, cover: p.id, coverVer: cacheVer(p) ?? null });
      } else {
        b.count++;
      }
    }
    return Array.from(m.values()).sort((a, b) => b.ym.localeCompare(a.ym));
  }, [scope, me?.id]);

  if (!buckets) {
    return (
      <>
        <Heading />
        <CalendarSkeleton />
      </>
    );
  }
  if (buckets.length === 0) {
    return (
      <>
        <Heading />
        <EmptyState
          kind="month"
          title="no months yet"
          sub="once you upload, your calendar fills in."
        />
      </>
    );
  }

  // Group by year
  const byYear = new Map<number, MonthBucket[]>();
  for (const b of buckets) {
    const arr = byYear.get(b.year) ?? [];
    arr.push(b);
    byYear.set(b.year, arr);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);

  return (
    <>
      <Heading />
      <div className="space-y-10">
        {years.map((year) => {
          const ms = byYear.get(year)!;
          return (
            <section key={year}>
              <header className="material sticky top-12 md:top-0 z-10 -mx-4 md:-mx-8 lg:-mx-10 px-4 md:px-8 lg:px-10 py-2 mb-3">
                <h3 className="font-display text-title3 font-semibold text-ink m-0 tabular-nums">{year}</h3>

              </header>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {ms.map((b, i) => (
                  <motion.div
                    key={b.ym}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.04 }}
                  >
                    <Link
                      to={`/m/${b.ym}`}
                      className="tile block aspect-[4/3] relative no-underline !rounded-lg"
                      
                    >
                      {b.cover ? (
                        <img
                          src={imgUrl.thumb(b.cover, b.coverVer)}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : null}
                      <div
                        className="absolute inset-x-0 bottom-0 p-3 text-ink"
                        style={{
                          background:
                            "linear-gradient(to top, rgb(var(--scrim) / 0.88) 0%, rgb(var(--scrim) / 0.5) 45%, transparent 100%)",
                        }}
                      >
                        <p className="m-0 text-[14px] font-semibold -tracking-[0.01em]">
                          {MONTH_NAMES[b.monthIdx]}
                        </p>
                        <p className="m-0 text-caption text-ink/70 tabular-nums">
                          {b.count} {b.count === 1 ? "picture" : "pictures"}
                        </p>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Heading() {
  return (
    <header className="flex items-end justify-between gap-4 pb-3 mb-5 hairline-b">
      <div>
        <h2 className="font-display text-large font-bold m-0 text-ink">Calendar</h2>
        <span className="block mt-0.5 text-footnote text-ink-fade">your year, month by month</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ScopeToggle />
      </div>
    </header>
  );
}
