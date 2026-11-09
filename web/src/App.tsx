import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Home } from "./routes/Home";
import { Trash } from "./routes/Trash";
import { Month } from "./routes/Month";
import { Albums } from "./routes/Albums";
import { AlbumDetail } from "./routes/AlbumDetail";
import { Calendar } from "./routes/Calendar";
import { Settings } from "./routes/Settings";
import { NotAuthorized } from "./routes/NotAuthorized";
import { UserProvider, RequireUser, useUser } from "./user";
import { syncFromServer, fullResync } from "./sync";
import { autoBackfill, backfillImageThumbnails } from "./backfill";

/**
 * Drives sync. Lives here rather than in App so it mounts only once an identity
 * is resolved: the reconcile step needs to know who "me" is, and syncing before
 * that would write a mirror it cannot attribute.
 */
function SyncRunner() {
  const { me } = useUser();
  useEffect(() => {
    if (!me) return;
    // Boot with the authoritative snapshot; poll with the cheap delta.
    fullResync()
      .then(() => autoBackfill())
      .catch(console.error);
    // Pictures pushed from a Shortcut while the app is open get their real
    // thumbnails on the next poll rather than waiting for a relaunch.
    const t = setInterval(
      () =>
        syncFromServer()
          .then(() => backfillImageThumbnails({ limit: 40 }))
          .catch(console.error),
      60_000,
    );
    return () => clearInterval(t);
  }, [me?.id]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <Routes>
          {/* Outside the guard — it must render for someone with no identity. */}
          <Route path="/not-authorized" element={<NotAuthorized />} />
          <Route element={<RequireUser />}>
            <Route element={<AppShell syncRunner={<SyncRunner />} />}>
              <Route path="/" element={<Home />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/m/:ym" element={<Month />} />
              <Route path="/albums" element={<Albums />} />
              <Route path="/a/:id" element={<AlbumDetail />} />
              <Route path="/trash" element={<Trash />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </UserProvider>
    </BrowserRouter>
  );
}
