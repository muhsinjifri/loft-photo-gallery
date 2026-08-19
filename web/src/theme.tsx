import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** "system" follows the OS appearance, the way every Apple app does by default. */
export type ThemePref = "system" | "light" | "dark";
export type Resolved = "light" | "dark";

const KEY = "loft_theme";
const ROOM: Record<Resolved, string> = { dark: "#000000", light: "#F2F2F7" };

interface ThemeCtx {
  /** What the user chose. */
  pref: ThemePref;
  /** What that resolves to right now. */
  theme: Resolved;
  setPref: (t: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function readPref(): ThemePref {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

const query = () => window.matchMedia("(prefers-color-scheme: dark)");

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && query().matches,
  );

  // Live-follow the OS switch, so the app changes with everything else at dusk.
  useEffect(() => {
    const m = query();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  const theme: Resolved = pref === "system" ? (systemDark ? "dark" : "light") : pref;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // Keep the iOS status bar and Android chrome in step, so an installed PWA
    // doesn't show a pale strip above a black app.
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute("content", ROOM[theme]));
  }, [theme]);

  const setPref = useCallback((t: ThemePref) => {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
    setPrefState(t);
  }, []);

  const value = useMemo(() => ({ pref, theme, setPref }), [pref, theme, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
