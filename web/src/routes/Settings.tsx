import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RefreshCw, Download as DownloadIcon, Trash2, Film, LogOut } from "lucide-react";
import { db } from "../db";
import { syncFromServer } from "../sync";
import { backfillVideoThumbnails, countPlaceholderVideos } from "../backfill";
import { Underline } from "../components/flourishes";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function Settings() {
  const lastSync = useLiveQuery(async () => {
    const row = await db.meta.get("last_sync");
    const n = row?.value ? Number(row.value) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, []);

  const photoCount = useLiveQuery(() => db.photos.count(), []);
  const albumCount = useLiveQuery(() => db.albums.count(), []);

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
    await db.meta.clear();
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
      <header className="relative flex items-end justify-between gap-4 pb-4 mb-6">
        <div>
          <h2 className="font-serif text-3xl sm:text-4xl m-0 text-ink -tracking-[0.015em] leading-[1.1]">
            Settings
          </h2>
          <span className="block mt-1 font-serif italic text-[13.5px] text-ink-fade">
            tune the loft to your liking
          </span>
        </div>
        <span className="absolute -bottom-[3px] right-0 w-1.5 h-1.5 rounded-full bg-highlight" />
        <Underline className="block absolute -bottom-[5px] inset-x-0 w-full h-1.5 text-accent/50" />
      </header>

      <div className="space-y-5 max-w-[640px]">
        <Section title="Account">
          <Row label="Signed in as">
            <span className="text-ink-soft">authorized via Cloudflare Access</span>
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
            <fieldset className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-ink-soft text-[14px]">
                <input type="radio" name="theme" defaultChecked className="accent-accent" /> Warm light
              </label>
              <label className="inline-flex items-center gap-1.5 text-ink-trace text-[14px]">
                <input type="radio" name="theme" disabled /> Warm dark
                <span className="text-[11px] italic">— soon</span>
              </label>
            </fieldset>
          </Row>
        </Section>

        <Section title="App">
          <Row label="Install">
            {installPrompt ? (
              <button type="button" className="btn btn-primary inline-flex items-center gap-1.5" onClick={doInstall}>
                <DownloadIcon className="w-4 h-4" /> Add to home screen
              </button>
            ) : (
              <span className="italic text-ink-fade text-[13.5px]">
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
              <span className="italic text-ink-fade text-[12.5px]">last: {syncedLabel}</span>
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
              <span className="italic text-ink-fade text-[12.5px]">
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
            <span className="text-ink-fade italic">— of —</span>
          </Row>
          <p className="text-[12.5px] italic text-ink-fade m-0">
            storage stats are coming soon.
          </p>
        </Section>

        <Section title="About">
          <Row label="Version">
            <span className="text-ink-soft font-mono text-[13px]">{version}</span>
          </Row>
          <Row label="In your loft">
            <span className="text-ink-soft text-[13.5px]">
              {photoCount ?? 0} {photoCount === 1 ? "picture" : "pictures"} ·{" "}
              {albumCount ?? 0} {albumCount === 1 ? "album" : "albums"}
            </span>
          </Row>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="paper-card">
      <h3 className="font-serif italic text-[15px] text-ink-fade font-medium lowercase tracking-[0.04em] m-0 mb-3 pb-2 border-b border-line">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
      <span className="font-serif text-[13.5px] italic text-ink-fade">{label}</span>
      <div>{children}</div>
    </div>
  );
}
