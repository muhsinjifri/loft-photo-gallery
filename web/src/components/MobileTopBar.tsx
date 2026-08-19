import { Link, NavLink } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";

/** A compact navigation bar on vibrant material, the way an iOS bar sits over content. */
export function MobileTopBar() {
  return (
    <header className="material hairline-b md:hidden sticky top-0 z-20 px-4 h-11 flex items-center justify-between gap-3">
      <Link to="/" className="no-underline" aria-label="Loft home">
        <span className="font-display text-[17px] font-semibold text-ink -tracking-[0.02em]">
          Loft
        </span>
      </Link>
      <NavLink
        to="/settings"
        aria-label="Settings"
        className={({ isActive }) =>
          `inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
            isActive ? "text-accent" : "text-ink-fade"
          }`
        }
      >
        <SettingsIcon className="w-[19px] h-[19px]" />
      </NavLink>
    </header>
  );
}
