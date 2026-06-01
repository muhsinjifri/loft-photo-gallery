import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "framer-motion";
import { db } from "../db";
import { imgUrl, cacheVer } from "../api";
import { EmptyState } from "../components/EmptyState";
import { CalendarSkeleton } from "../components/skeletons";
import { SectionDivider, Underline } from "../components/flourishes";

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
  const buckets = useLiveQuery(async (): Promise<MonthBucket[]> => {
    const photos = await db.photos
      .filter((p) => !p.deleted_at && !!p.year_month)
      .toArray();
    photos.sort((a, b) => (b.taken_at ?? b.uploaded_at) - (a.taken_at ?? a.uploaded_at));
    const m = new Map<string, MonthBucket>();
    for (const p of photos) {
      const ym = p.year_month!;
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
  }, []);

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
              <header className="sticky top-12 md:top-0 z-10 -mx-4 md:-mx-8 lg:-mx-10 px-4 md:px-8 lg:px-10 py-2 backdrop-blur-md bg-paper/85 mb-4">
                <h3 className="font-serif text-2xl text-ink m-0 leading-tight">{year}</h3>
                <span className="block w-24 h-1.5 mt-0.5 text-ink-trace">
                  <SectionDivider className="block w-full h-full" />
                </span>
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
                      className="tile block aspect-[4/3] relative no-underline"
                      style={{ background: "var(--c-paper, #EDE5D6)" }}
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
                        className="absolute inset-x-0 bottom-0 p-3 text-paper-tint"
                        style={{
                          background:
                            "linear-gradient(to top, rgba(20,16,12,0.72), rgba(20,16,12,0))",
                        }}
                      >
                        <p className="m-0 font-serif text-[15px] font-medium">
                          {MONTH_NAMES[b.monthIdx]}
                        </p>
                        <p className="m-0 text-[11.5px] italic text-paper-tint/75">
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
    <header className="relative flex items-end justify-between gap-4 pb-4 mb-6">
      <div>
        <h2 className="font-serif text-3xl sm:text-4xl m-0 text-ink -tracking-[0.015em] leading-[1.1]">
          Calendar
        </h2>
        <span className="block mt-1 font-serif italic text-[13.5px] text-ink-fade">
          your year, month by month
        </span>
      </div>
      <span className="absolute -bottom-[3px] right-0 w-1.5 h-1.5 rounded-full bg-highlight" />
      <Underline className="block absolute -bottom-[5px] inset-x-0 w-full h-1.5 text-accent/50" />
    </header>
  );
}
