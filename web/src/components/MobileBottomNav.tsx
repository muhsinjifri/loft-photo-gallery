import { NavLink } from "react-router-dom";
import { Images, CalendarDays, FolderOpen, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

interface ItemProps {
  to: string;
  end?: boolean;
  icon: ReactNode;
  label: string;
}

/**
 * An iOS tab bar: the selected tab is marked by tinting the glyph and label in
 * the accent, never by a pill or a background. Nothing moves between tabs.
 */
function Item({ to, end, icon, label }: ItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex-1 flex flex-col items-center justify-center gap-[3px] pt-2 pb-1.5 transition-colors ${
          isActive ? "text-accent" : "text-ink-fade"
        }`
      }
    >
      {icon}
      <span className="text-[10px] font-medium tracking-[0.01em]">{label}</span>
    </NavLink>
  );
}

export function MobileBottomNav() {
  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="material md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch"
      style={{
        boxShadow: "inset 0 1px 0 0 rgb(var(--line) / var(--line-a))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Item to="/" end icon={<Images className="w-[23px] h-[23px]" />} label="Photos" />
      <Item to="/calendar" icon={<CalendarDays className="w-[23px] h-[23px]" />} label="Calendar" />
      <Item to="/albums" icon={<FolderOpen className="w-[23px] h-[23px]" />} label="Albums" />
      <Item to="/trash" icon={<Trash2 className="w-[23px] h-[23px]" />} label="Trash" />
    </nav>
  );
}
