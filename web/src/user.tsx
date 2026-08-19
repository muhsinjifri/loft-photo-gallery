import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import type { Me, MeResponse, PublicUser } from "@loft/shared";
import { api, ApiError, setUnauthorizedHandler } from "./api";
import { db, getMeta, setMeta, CURRENT_USER_KEY, IDENTITY_KEY } from "./db";
import { wipeLocalIdentityData } from "./sync";

type Status = "loading" | "ready" | "unauthorized";

interface UserCtx {
  me: Me | null;
  users: PublicUser[];
  /** The other resident, if one is configured. */
  partner: PublicUser | null;
  status: Status;
  /** True when rendering a cached identity because /api/me was unreachable. */
  stale: boolean;
  isMine: (ownerId: string | null | undefined) => boolean;
  displayNameFor: (ownerId: string | null | undefined) => string;
  refresh: (next: MeResponse) => void;
}

const Ctx = createContext<UserCtx | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [stale, setStale] = useState(false);
  const hadCache = useRef(false);

  // Register before the first request goes out.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setStatus("unauthorized");
      navigate("/not-authorized", { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // 1. Paint from the cached identity first. This app is a PWA whose whole
      //    point is browsing a cached mirror offline — if identity required a
      //    live /api/me, every offline cold boot would be a blank screen with a
      //    perfectly good library sitting in IndexedDB. The cache is a rendering
      //    hint, not a security boundary: the server authorizes every request.
      const cached = await getMeta(IDENTITY_KEY);
      if (cached && !cancelled) {
        try {
          const c = JSON.parse(cached) as MeResponse;
          hadCache.current = true;
          setMe(c.me);
          setUsers(c.users);
          setStatus("ready");
        } catch {
          /* corrupt cache — revalidation below will fix it */
        }
      }

      // 2. Revalidate.
      try {
        const fresh = await api.me();
        if (cancelled) return;

        // 3. Identity-change guard. A different person is now signed in on this
        //    browser profile, so the mirror and the service worker's cached
        //    thumbnails belong to someone else. Wipe, then reload rather than
        //    continuing in place: a sync started for the previous identity may
        //    still be in flight, and letting it land would write their rows into
        //    a mirror now labelled as this user's.
        const prevId = await getMeta(CURRENT_USER_KEY);
        if (prevId && prevId !== fresh.me.id) {
          await wipeLocalIdentityData();
          await setMeta(CURRENT_USER_KEY, fresh.me.id);
          location.reload();
          return;
        }

        await setMeta(IDENTITY_KEY, JSON.stringify(fresh));
        await setMeta(CURRENT_USER_KEY, fresh.me.id);
        if (cancelled) return;
        setMe(fresh.me);
        setUsers(fresh.users);
        setStale(false);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          await db.meta.delete(IDENTITY_KEY);
          await db.meta.delete(CURRENT_USER_KEY);
          setStatus("unauthorized");
          navigate("/not-authorized", { replace: true });
          return;
        }
        // Network failure: stay up on the cached identity if we have one.
        if (hadCache.current) setStale(true);
        else setStatus("unauthorized");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const partner = useMemo(() => users.find((u) => u.id !== me?.id) ?? null, [users, me?.id]);

  const isMine = useCallback(
    (ownerId: string | null | undefined) => !!me && !!ownerId && ownerId === me.id,
    [me],
  );

  const displayNameFor = useCallback(
    (ownerId: string | null | undefined) => {
      if (!ownerId) return "—";
      if (me && ownerId === me.id) return me.display_name;
      return users.find((u) => u.id === ownerId)?.display_name ?? "someone else";
    },
    [me, users],
  );

  const refresh = useCallback((next: MeResponse) => {
    setMe(next.me);
    setUsers(next.users);
    void setMeta(IDENTITY_KEY, JSON.stringify(next));
  }, []);

  const value = useMemo(
    () => ({ me, users, partner, status, stale, isMine, displayNameFor, refresh }),
    [me, users, partner, status, stale, isMine, displayNameFor, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser(): UserCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
}

/** Gates the authenticated app without gating /not-authorized, which must render with no identity. */
export function RequireUser() {
  const { status } = useUser();
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <span className="text-ink-fade text-sm">opening the loft…</span>
      </div>
    );
  }
  if (status === "unauthorized") return <Navigate to="/not-authorized" replace />;
  return <Outlet />;
}
