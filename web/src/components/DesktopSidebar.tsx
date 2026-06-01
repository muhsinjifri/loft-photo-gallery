import { useLiveQuery } from "dexie-react-hooks";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Images,
  CalendarDays,
  FolderOpen,
  Trash2,
  Settings as SettingsIcon,
  Plus,
  ChevronDown,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { db } from "../db";
import { api } from "../api";
import { BrandFlourish, SectionDivider } from "./flourishes";

interface NavRowProps {
  to: string;
  end?: boolean;
  icon: ReactNode;
  children: ReactNode;
}

function NavRow({ to, end, icon, children }: NavRowProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex items-center gap-2.5 px-3 py-2 rounded-sm text-[14.5px] transition-colors ${
          isActive
            ? "text-ink font-medium"
            : "text-ink-soft hover:text-ink hover:bg-paper-deep/60"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="navPill"
              className="absolute inset-0 -z-10 rounded-sm bg-accent/[0.08]"
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            />
          )}
          <span className="text-ink-fade [.text-ink_&]:text-ink-soft shrink-0">{icon}</span>
          <span>{children}</span>
        </>
      )}
    </NavLink>
  );
}

export function DesktopSidebar() {
  const albums = useLiveQuery(
    () => db.albums.orderBy("created_at").reverse().toArray(),
    [],
  );
  const lastSync = useLiveQuery(async () => {
    const row = await db.meta.get("last_sync");
    const n = row?.value ? Number(row.value) : 0;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, []);
  const [albumsOpen, setAlbumsOpen] = useState(true);
  const location = useLocation();

  async function newAlbum() {
    const name = prompt("Album name?");
    if (!name?.trim()) return;
    const { album } = await api.createAlbum(name.trim());
    await db.albums.put(album);
  }

  const syncedLabel = (() => {
    if (!lastSync) return "not synced yet";
    const mins = Math.max(0, Math.round((Date.now() - lastSync) / 60000));
    if (mins < 1) return "synced just now";
    if (mins === 1) return "synced 1 min ago";
    if (mins < 60) return `synced ${mins} min ago`;
    const hrs = Math.round(mins / 60);
    return `synced ${hrs}h ago`;
  })();

  return (
    <aside
      className="
        torn-edge relative hidden md:flex flex-col
        w-[224px] lg:w-[260px]
        bg-gradient-to-b from-paper-deep/55 to-paper-deep/25
        border-r border-line
        h-screen sticky top-0
        px-5 lg:px-6 pt-7 pb-5
      "
    >
      {/* Brand */}
      <div className="mb-6 shrink-0">
        <h1 className="font-display text-[44px] leading-[0.9] text-ink m-0 -tracking-[0.5px]">
          Loft
        </h1>
        <span className="block w-24 h-3 mt-0.5 text-highlight">
          <BrandFlourish className="block w-full h-full" />
        </span>
        <span className="block mt-1.5 font-serif italic text-[13px] text-ink-fade">
          a quiet place for pictures
        </span>
      </div>

      {/* Pinned destinations */}
      <nav className="flex flex-col gap-0.5">
        <NavRow to="/" end icon={<Images className="w-4 h-4" />}>
          All photos
        </NavRow>
        <NavRow to="/calendar" icon={<CalendarDays className="w-4 h-4" />}>
          Calendar
        </NavRow>
        <NavRow to="/albums" end icon={<FolderOpen className="w-4 h-4" />}>
          Albums
        </NavRow>
        <NavRow to="/trash" icon={<Trash2 className="w-4 h-4" />}>
          Trash
        </NavRow>
      </nav>

      {/* Albums collapsible */}
      <section className="mt-7 flex-1 min-h-0 flex flex-col">
        <header className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => setAlbumsOpen((v) => !v)}
            className="flex items-center gap-1 font-serif italic text-[13px] font-medium text-ink-fade tracking-[0.03em] lowercase hover:text-ink-soft transition-colors"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${albumsOpen ? "" : "-rotate-90"}`}
            />
            albums
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={newAlbum}
            title="New album"
            aria-label="New album"
            style={{ width: 26, height: 26 }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </header>
        <span className="block w-full h-1.5 my-1 text-ink-trace">
          <SectionDivider className="block w-full h-full" />
        </span>
        {albumsOpen && (
          <nav className="flex flex-col gap-0.5 overflow-y-auto -mr-2 pr-2" key={location.pathname}>
            {albums?.length ? (
              albums.map((a) => (
                <NavLink
                  key={a.id}
                  to={`/a/${a.id}`}
                  className={({ isActive }) =>
                    `block px-3 py-1.5 rounded-sm text-[14px] transition-colors truncate ${
                      isActive
                        ? "text-ink font-medium bg-accent/[0.08]"
                        : "text-ink-soft hover:text-ink hover:bg-paper-deep/60"
                    }`
                  }
                >
                  {a.name}
                </NavLink>
              ))
            ) : (
              <span className="text-ink-fade italic text-[13px] px-3 py-1">none yet</span>
            )}
          </nav>
        )}
      </section>

      {/* Footer */}
      <div className="shrink-0 pt-3 mt-3 border-t border-line space-y-1.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-1.5 rounded-sm text-[13.5px] transition-colors ${
              isActive
                ? "text-ink font-medium"
                : "text-ink-soft hover:text-ink hover:bg-paper-deep/60"
            }`
          }
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          Settings
        </NavLink>
        <p className="text-[11.5px] italic text-ink-fade m-0 px-3">{syncedLabel}</p>
        <p className="text-[11.5px] text-ink-trace m-0 px-3">— used of —</p>
      </div>
    </aside>
  );
}
