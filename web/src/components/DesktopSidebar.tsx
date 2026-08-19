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
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { db } from "../db";
import { api } from "../api";

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
        `relative flex items-center gap-2.5 px-2.5 py-[5px] rounded-sm text-[13.5px] transition-colors ${
          isActive ? "text-accent-on font-medium" : "text-ink hover:bg-ink/[0.06]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="navPill"
              className="absolute inset-0 -z-10 rounded-sm bg-accent"
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
            />
          )}
          <span className={`shrink-0 ${isActive ? "text-accent-on" : "text-accent"}`}>{icon}</span>
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
        material hairline-r relative hidden md:flex flex-col
        w-[228px] lg:w-[250px]
        h-screen sticky top-0
        px-3 lg:px-3.5 pt-5 pb-4
      "
    >
      {/* Brand */}
      <div className="mb-5 shrink-0 px-2 pt-1">
        <h1 className="font-display text-[21px] font-semibold leading-none text-ink m-0 -tracking-[0.02em]">
          Loft
        </h1>
        <span className="block mt-1 text-[12px] text-ink-fade">a quiet place for pictures</span>
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
            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-fade hover:text-ink-soft transition-colors"
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
        {albumsOpen && (
          <nav className="flex flex-col gap-0.5 overflow-y-auto -mr-2 pr-2" key={location.pathname}>
            {albums?.length ? (
              albums.map((a) => (
                <NavLink
                  key={a.id}
                  to={`/a/${a.id}`}
                  className={({ isActive }) =>
                    `block px-2.5 py-[5px] rounded-sm text-[13.5px] transition-colors truncate ${
                      isActive
                        ? "text-accent-on font-medium bg-accent"
                        : "text-ink hover:bg-ink/[0.06]"
                    }`
                  }
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{a.name}</span>
                    {a.is_shared === 1 && (
                      <Users className="w-3 h-3 shrink-0 opacity-60" aria-label="shared" />
                    )}
                  </span>
                </NavLink>
              ))
            ) : (
              <span className="text-ink-fade text-[13px] px-2.5 py-1">none yet</span>
            )}
          </nav>
        )}
      </section>

      {/* Footer */}
      <div className="shrink-0 pt-3 mt-3 border-t border-line space-y-1.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-2.5 py-[5px] rounded-sm text-[13.5px] transition-colors ${
              isActive ? "text-accent-on font-medium bg-accent" : "text-ink hover:bg-ink/[0.06]"
            }`
          }
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          Settings
        </NavLink>
        <p className="text-[11.5px] text-ink-fade m-0 px-2.5">{syncedLabel}</p>
        
      </div>
    </aside>
  );
}
