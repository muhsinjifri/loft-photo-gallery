import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Home } from "./routes/Home";
import { Trash } from "./routes/Trash";
import { Month } from "./routes/Month";
import { Albums } from "./routes/Albums";
import { AlbumDetail } from "./routes/AlbumDetail";
import { Calendar } from "./routes/Calendar";
import { Settings } from "./routes/Settings";
import { NotAuthorized } from "./routes/NotAuthorized";
import { syncFromServer } from "./sync";
import { autoBackfill } from "./backfill";

export function App() {
  useEffect(() => {
    syncFromServer()
      .then(() => autoBackfill())
      .catch(console.error);
    const t = setInterval(() => syncFromServer().catch(console.error), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/m/:ym" element={<Month />} />
          <Route path="/albums" element={<Albums />} />
          <Route path="/a/:id" element={<AlbumDetail />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/not-authorized" element={<NotAuthorized />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
