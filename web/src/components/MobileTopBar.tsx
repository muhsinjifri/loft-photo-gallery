import { Link, NavLink, useLocation } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { BrandFlourish } from "./flourishes";

export function MobileTopBar() {
  const loc = useLocation();
  // Hide brand on viewer-style routes? Always show brand for now.
  return (
    <header
      className="md:hidden sticky top-0 z-20 px-4 pt-4 pb-3 backdrop-blur-md flex items-start justify-between gap-3"
      style={{
        background:
          "linear-gradient(to bottom, rgba(244,239,230,0.92), rgba(244,239,230,0.78))",
        borderBottom: "1px solid var(--c-ink-trace, rgba(58,50,40,0.10))",
      }}
    >
      <Link
        to="/"
        className="inline-flex flex-col items-start no-underline"
        aria-label="Loft home"
        key={loc.pathname}
      >
        <span className="font-display text-[32px] leading-none text-ink m-0 -tracking-[0.4px]">
          Loft
        </span>
        <span className="block w-16 h-2 mt-0.5 text-highlight">
          <BrandFlourish className="block w-full h-full" />
        </span>
      </Link>
      <NavLink
        to="/settings"
        aria-label="Settings"
        className={({ isActive }) =>
          `inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
            isActive ? "text-accent-deep bg-accent/10" : "text-ink-fade"
          }`
        }
      >
        <SettingsIcon className="w-[22px] h-[22px]" />
      </NavLink>
    </header>
  );
}
