import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Images, CalendarDays, FolderOpen, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

interface ItemProps {
  to: string;
  end?: boolean;
  icon: ReactNode;
  label: string;
}

function Item({ to, end, icon, label }: ItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
          isActive ? "text-ink" : "text-ink-fade"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="mobileNavPill"
              className="absolute inset-x-3 top-1 bottom-1 rounded-full bg-accent/10 -z-10"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className={isActive ? "text-accent-deep" : "text-ink-fade"}>{icon}</span>
          <span
            className={`text-[10.5px] tracking-wide ${isActive ? "font-medium" : ""}`}
            style={{ fontFamily: "var(--font-serif, serif)" }}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function MobileBottomNav() {
  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="
        md:hidden fixed bottom-0 inset-x-0 z-30
        flex items-stretch
        backdrop-blur-md
      "
      style={{
        background: "rgba(244,239,230,0.94)",
        borderTop: "1px solid rgba(58,50,40,0.10)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Item to="/" end icon={<Images className="w-[22px] h-[22px]" />} label="Photos" />
      <Item to="/calendar" icon={<CalendarDays className="w-[22px] h-[22px]" />} label="Calendar" />
      <Item to="/albums" icon={<FolderOpen className="w-[22px] h-[22px]" />} label="Albums" />
      <Item to="/trash" icon={<Trash2 className="w-[22px] h-[22px]" />} label="Trash" />
    </nav>
  );
}
