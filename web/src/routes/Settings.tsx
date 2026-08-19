import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RefreshCw, Download as DownloadIcon, Trash2, Film, LogOut } from "lucide-react";
import { db, LAST_SYNC_KEY } from "../db";
import { syncFromServer, clearImageCaches, wipeLocalIdentityData } from "../sync";
import { backfillVideoThumbnails, countPlaceholderVideos, skipKey } from "../backfill";
import { getDevUser, setDevUser } from "../api";
import { loadSharedAlbumIds } from "../filter";
import { useUser } from "../user";
import { useTheme, type ThemePref } from "../theme";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function Settings() {
  const { me, partner, stale } = useUser();
  const { pref, setPref } = useTheme();

  const lastSync = useLiveQuery(async () => {
    const row = await db.meta.get("last_sync");
    const n = row?.value ? Number(row.value) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, []);

  const counts = useLiveQuery(async () => {
    if (!me) return null;
    const sharedIds = await loadSharedAlbumIds();
    const albums = await db.albums.toArray();
    let mine = 0;
    let shared = 0;
    await db.photos.each((p) => {
      if (p.deleted_at) return;
      if (p.owner_id === me.id) mine++;
      if (p.album_id && sharedIds.has(p.album_id)) shared++;
    });
    return {
      mine,
      shared,
      albumsMine: albums.filter((a) => a.owner_id === me.id).length,
      albumsShared: albums.filter((a) => a.is_shared === 1).length,
    };
  }, [me?.id]);

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [syncing, setSyncing] = useState(false);

  const placeholderCount = useLiveQuery(() => countPlaceholderVideos(), []);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  async function regenerateThumbnails() {
    setBackfilling(true);
    setBackfillMsg("starting…");
    try {
      const r = await backfillVideoThumbnails({
        ignoreSkip: true,
        onProgress: (p) =>
          setBackfillMsg(
            p.done >= p.total
              ? `done — ${p.fixed} fixed${p.failed ? `, ${p.failed} couldn't decode` : ""}`
              : `${p.done + 1}/${p.total}: ${p.current ?? ""}`,
          ),
      });
      setBackfillMsg(
        r.total === 0
          ? "nothing to regenerate"
          : `done — ${r.fixed} fixed${r.failed ? `, ${r.failed} couldn't decode here` : ""}`,
      );
    } finally {
      setBackfilling(false);
    }
  }

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function manualSync() {
    setSyncing(true);
    try {
      await syncFromServer();
    } finally {
      setSyncing(false);
    }
  }

  async function clearCache() {
    if (!confirm("Clear local cache? You'll re-download thumbs on next visit.")) return;
    await db.photos.clear();
    await db.albums.clear();
    // Deliberately NOT db.meta.clear(): that would drop the cached identity, and
    // the next offline boot would have no idea whose mirror this is.
    await db.meta.delete(LAST_SYNC_KEY);
    await db.meta.delete(await skipKey());
    // The service-worker thumb/preview caches are most of what "cache" means to
    // someone pressing this button, and the old version never touched them.
    await clearImageCaches();
    location.reload();
  }

  function signOut() {
    // Cloudflare Access logout: clears the Access session cookie, then bounces
    // back to the login screen. (In dev, Access is bypassed so this 404s — that's fine.)
    window.location.href = "/cdn-cgi/access/logout";
  }

  async function doInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  const syncedLabel = (() => {
    if (!lastSync) return "not yet synced";
    const date = new Date(lastSync);
    return date.toLocaleString();
  })();

  const version = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.1.0";

  return (
    <>
      <header className="flex items-end justify-between gap-4 pb-3 mb-5 hairline-b">
        <div>
          <h2 className="font-display text-large font-bold m-0 text-ink">Settings</h2>
          <span className="block mt-0.5 text-footnote text-ink-fade">tune the loft to your liking</span>
        </div>
      </header>

      <div className="space-y-6 max-w-[620px]">
        <Section title="Account">
          <Row label="Signed in as">
            <div className="flex flex-col">
              <span className="text-ink-soft">{me?.display_name ?? "—"}</span>
              <span className="text-footnote text-ink-fade">{me?.email}</span>
              {stale && (
                <span className="text-footnote text-ink-fade">
                  showing your last-known account — you're offline.
                </span>
              )}
            </div>
          </Row>
          <Row label="Sharing with">
            <span className="text-ink-soft">
              {partner ? (
                partner.display_name
              ) : (
                <span className="text-ink-fade">no one else yet</span>
              )}
            </span>
          </Row>
          <Row label="Session">
            <button
              type="button"
              className="btn inline-flex items-center gap-1.5"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </Row>
        </Section>

        <Section title="Appearance">
          <Row label="Theme">
            <div role="group" aria-label="Theme" className="segmented">
              {(["system", "light", "dark"] as ThemePref[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={pref === t}
                  onClick={() => setPref(t)}
                  className="capitalize"
                >
                  {pref === t && (
                    <span data-thumb className="absolute inset-0 rounded-[7px] bg-paper-thumb shadow-thumb" />
                  )}
                  <span>{t}</span>
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section title="App">
          <Row label="Install">
            {installPrompt ? (
              <button type="button" className="btn btn-primary inline-flex items-center gap-1.5" onClick={doInstall}>
                <DownloadIcon className="w-4 h-4" /> Add to home screen
              </button>
            ) : (
              <span className="text-ink-fade text-footnote">
                already installed, or install isn't available here.
              </span>
            )}
          </Row>
          <Row label="Sync">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn inline-flex items-center gap-1.5"
                onClick={manualSync}
                disabled={syncing}
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <span className="text-ink-fade text-footnote tabular-nums">last: {syncedLabel}</span>
            </div>
          </Row>
          <Row label="Local cache">
            <button
              type="button"
              className="btn inline-flex items-center gap-1.5"
              onClick={clearCache}
            >
              <Trash2 className="w-4 h-4" /> Clear cache
            </button>
          </Row>
          <Row label="Video thumbnails">
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                className="btn inline-flex items-center gap-1.5 self-start"
                onClick={regenerateThumbnails}
                disabled={backfilling || (placeholderCount ?? 0) === 0}
              >
                <Film className={`w-4 h-4 ${backfilling ? "animate-pulse" : ""}`} />
                {backfilling
                  ? "Regenerating…"
                  : `Regenerate${placeholderCount ? ` (${placeholderCount})` : ""}`}
              </button>
              <span className="text-ink-fade text-footnote tabular-nums">
                {backfillMsg ??
                  ((placeholderCount ?? 0) === 0
                    ? "all videos have real thumbnails."
                    : `${placeholderCount} video${placeholderCount === 1 ? "" : "s"} showing a placeholder — best run on desktop.`)}
              </span>
            </div>
          </Row>
        </Section>

        <Section title="Storage">
          <Row label="Used">
            <span className="text-ink-fade">— of —</span>
          </Row>
          <Row label="Storage stats">
            <span className="text-ink-fade text-footnote">coming soon</span>
          </Row>
        </Section>

        {import.meta.env.DEV && (
          <Section title="Dev">
            <Row label="Act as">
              <select
                value={getDevUser() ?? ""}
                onChange={async (e) => {
                  setDevUser(e.target.value || null);
                  // Reuse the real identity-change guard rather than a dev-only
                  // shortcut, so the highest-risk path in the app gets exercised
                  // constantly during development instead of once in production.
                  await wipeLocalIdentityData();
                  location.reload();
                }}
                className="rounded border border-line-strong bg-paper-tint px-2 py-1 text-[13.5px] text-ink outline-none focus:border-accent"
              >
                <option value="">default (first allowed email)</option>
                <option value="1">user 1</option>
                <option value="2">user 2</option>
              </select>
            </Row>

          </Section>
        )}

        <Section title="About">
          <Row label="Version">
            <span className="text-ink-fade font-mono text-footnote tabular-nums">{version}</span>
          </Row>
          <Row label="In your loft">
            <span className="text-ink-fade text-footnote tabular-nums">
              {counts?.mine ?? 0} {counts?.mine === 1 ? "picture" : "pictures"} yours
              {partner ? ` · ${counts?.shared ?? 0} in shared albums` : ""} ·{" "}
              {counts?.albumsMine ?? 0} {counts?.albumsMine === 1 ? "album" : "albums"}
              {partner ? ` (${counts?.albumsShared ?? 0} shared)` : ""}
            </span>
          </Row>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="label m-0 mb-2 px-1">{title}</h3>
      <div className="paper-card !p-0 divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 items-center px-4 py-2.5 min-h-[44px]">
      <span className="text-body text-ink">{label}</span>
      <div className="justify-self-end text-right">{children}</div>
    </div>
  );
}
