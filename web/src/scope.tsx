import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Scope } from "@loft/shared";
import { useUser } from "./user";

const KEY = "loft_scope";

interface ScopeCtx {
  scope: Scope;
  setScope: (s: Scope) => void;
}

const Ctx = createContext<ScopeCtx | null>(null);

/**
 * Which pictures the timeline views show. Kept in context + localStorage rather
 * than the URL: it is a persistent viewing preference, not a location, and as a
 * query param every internal <Link> in the sidebar, Calendar and Albums would
 * have to propagate it or the toggle would silently reset on each navigation.
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const { partner } = useUser();
  const [raw, setRaw] = useState<Scope>(() =>
    (typeof localStorage !== "undefined" && localStorage.getItem(KEY)) === "ours" ? "ours" : "mine",
  );

  const setScope = useCallback((s: Scope) => {
    localStorage.setItem(KEY, s);
    setRaw(s);
  }, []);

  // Living alone, "Ours" is meaningless.
  const scope: Scope = partner ? raw : "mine";

  const value = useMemo(() => ({ scope, setScope }), [scope, setScope]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScope(): ScopeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useScope must be used inside <ScopeProvider>");
  return ctx;
}
