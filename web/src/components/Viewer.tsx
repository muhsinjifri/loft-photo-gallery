import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useGesture } from "@use-gesture/react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  Info,
  Undo2,
} from "lucide-react";
import type { Photo } from "@loft/shared";
import { api, imgUrl, cacheVer } from "../api";
import { db } from "../db";

interface Props {
  photos: Photo[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function Viewer({ photos, index, onIndexChange, onClose }: Props) {
  const photo = photos[index];
  const isVideo = photo?.mime.startsWith("video/") ?? false;

  const [zoomed, setZoomed] = useState(false);
  const [showChrome, setShowChrome] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chromeTimerRef = useRef<number | null>(null);

  const dragY = useMotionValue(0);
  const dragX = useMotionValue(0);
  const scale = useMotionValue(1);
  const lastTapRef = useRef(0);
  const overlayOpacity = useTransform(dragY, [-300, 0, 300], [0.4, 1, 0.4]);

  // Auto-hide chrome
  const ping = useCallback(() => {
    setShowChrome(true);
    if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = window.setTimeout(() => setShowChrome(false), 2500);
  }, []);

  useEffect(() => {
    ping();
    return () => {
      if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
    };
  }, [ping]);

  const goPrev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);
  const goNext = useCallback(() => {
    if (index < photos.length - 1) onIndexChange(index + 1);
  }, [index, photos.length, onIndexChange]);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        ping();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        ping();
      } else if (e.key === "i" || e.key === "I") {
        setInfoOpen((v) => !v);
        ping();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (!photo?.deleted_at) {
          setConfirmDelete(true);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, ping, photo?.deleted_at]);

  const springBack = useCallback(() => {
    animate(dragX, 0, { type: "spring", stiffness: 400, damping: 36 });
    animate(dragY, 0, { type: "spring", stiffness: 400, damping: 36 });
  }, [dragX, dragY]);

  const resetZoom = useCallback(() => {
    animate(scale, 1, { duration: 0.2 });
    animate(dragX, 0, { duration: 0.2 });
    animate(dragY, 0, { duration: 0.2 });
    setZoomed(false);
  }, [scale, dragX, dragY]);

  const toggleZoom = useCallback(() => {
    if (scale.get() > 1.01) {
      resetZoom();
    } else {
      scale.set(2.5);
      setZoomed(true);
    }
  }, [scale, resetZoom]);

  // Single gesture surface handles BOTH swipe-nav/dismiss (at scale 1) and
  // pan/pinch-zoom (when zoomed). Driving everything through one @use-gesture
  // binding avoids the touch-event fight that broke swipe on mobile when a
  // separate zoom library was nested inside.
  const bind = useGesture(
    {
      onDrag: ({ offset: [ox, oy], movement: [mx, my], velocity: [vx, vy], last, pinching, tap, cancel }) => {
        if (pinching) {
          cancel();
          return;
        }
        if (tap) {
          // Detect double-tap to toggle zoom (mobile-friendly).
          const now = Date.now();
          if (now - lastTapRef.current < 300 && !isVideo) toggleZoom();
          else ping();
          lastTapRef.current = now;
          return;
        }
        // Zoomed: pan the image (offset includes the from() start position).
        if (scale.get() > 1.01) {
          dragX.set(ox);
          dragY.set(oy);
          return;
        }
        // At scale 1: live-follow the finger for swipe nav / dismiss.
        if (!last) {
          dragX.set(mx);
          dragY.set(my);
          return;
        }
        const horizontal = Math.abs(mx) > Math.abs(my);
        const dismiss = my > 120 || (vy > 0.5 && my > 50);
        const navigate = Math.abs(mx) > 80 || (Math.abs(vx) > 0.3 && Math.abs(mx) > 35);
        if (!horizontal && dismiss) {
          onClose();
          return;
        }
        if (horizontal && navigate) {
          if (mx < 0) goNext();
          else goPrev();
        }
        springBack();
      },
      onPinch: ({ offset: [s], last }) => {
        ping();
        const ns = Math.max(1, Math.min(5, s));
        scale.set(ns);
        setZoomed(ns > 1.01);
        if (last && ns <= 1.01) resetZoom();
      },
    },
    {
      drag: { from: () => [dragX.get(), dragY.get()], filterTaps: true, pointer: { touch: true } },
      pinch: { scaleBounds: { min: 1, max: 5 }, from: () => [scale.get(), 0], pointer: { touch: true } },
    },
  );

  // Reset transform when switching photos.
  useEffect(() => {
    dragX.set(0);
    dragY.set(0);
    scale.set(1);
    setZoomed(false);
  }, [photo?.id, dragX, dragY, scale]);

  async function handleDelete() {
    if (!photo) return;
    await api.deletePhoto(photo.id);
    await db.photos.update(photo.id, { deleted_at: Date.now() });
    setConfirmDelete(false);
    // If there's a next photo, move to it; otherwise close.
    if (index < photos.length - 1) onIndexChange(index + 1);
    else if (index > 0) onIndexChange(index - 1);
    else onClose();
  }

  async function handleRestore() {
    if (!photo) return;
    await api.restorePhoto(photo.id);
    await db.photos.update(photo.id, { deleted_at: null });
    onClose();
  }

  const exifSummary = useMemo(() => {
    if (!photo?.exif_json) return null;
    try {
      return JSON.parse(photo.exif_json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [photo?.exif_json]);

  if (!photo) return null;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay forceMount asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ opacity: overlayOpacity as unknown as number }}
            className="fixed inset-0 z-[100]"
          >
            <div className="absolute inset-0" style={{ background: "rgba(26, 22, 18, 0.96)" }} />
          </motion.div>
        </Dialog.Overlay>

        <Dialog.Content
          forceMount
          asChild
          aria-describedby={undefined}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
            className="fixed inset-0 z-[101] flex flex-col"
            onMouseMove={ping}
          >
            <Dialog.Title className="sr-only">{photo.filename}</Dialog.Title>

            {/* Top bar */}
            <AnimatePresence>
              {showChrome && (
                <motion.header
                  key="topbar"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className="absolute top-0 inset-x-0 z-10 flex items-center gap-2 px-3 sm:px-5 py-3"
                  style={{
                    background:
                      "linear-gradient(to bottom, rgba(20,16,12,0.65), rgba(20,16,12,0))",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-icon"
                    aria-label="Close"
                    onClick={onClose}
                    style={{
                      background: "rgba(245,235,215,0.08)",
                      color: "#FAF5EC",
                      borderColor: "rgba(245,235,215,0.18)",
                    }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div
                    className="flex-1 truncate font-serif italic text-sm"
                    style={{ color: "rgba(245,235,215,0.78)" }}
                  >
                    {photo.filename}
                  </div>
                  <button
                    type="button"
                    className="btn btn-icon"
                    aria-label="Info"
                    onClick={() => setInfoOpen((v) => !v)}
                    aria-pressed={infoOpen}
                    style={{
                      background: infoOpen ? "rgba(107,130,102,0.22)" : "rgba(245,235,215,0.08)",
                      color: "#FAF5EC",
                      borderColor: "rgba(245,235,215,0.18)",
                    }}
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  <a
                    href={imgUrl.orig(photo.id)}
                    download={photo.filename}
                    aria-label="Download"
                    className="btn btn-icon inline-flex items-center justify-center"
                    style={{
                      background: "rgba(245,235,215,0.08)",
                      color: "#FAF5EC",
                      borderColor: "rgba(245,235,215,0.18)",
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  {photo.deleted_at ? (
                    <button
                      type="button"
                      onClick={handleRestore}
                      className="btn btn-primary inline-flex items-center gap-1.5"
                    >
                      <Undo2 className="w-4 h-4" /> Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      aria-label="Move to trash"
                      className="btn btn-icon"
                      style={{
                        background: "rgba(245,235,215,0.08)",
                        color: "#FAF5EC",
                        borderColor: "rgba(245,235,215,0.18)",
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </motion.header>
              )}
            </AnimatePresence>

            {/* Image area with swipe + pinch */}
            <div
              className="flex-1 relative overflow-hidden touch-none select-none"
              {...bind()}
              style={{ touchAction: "none" }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ opacity: { duration: 0.2 } }}
                  style={{ x: dragX, y: dragY, scale }}
                  className="absolute inset-0 flex items-center justify-center p-4 sm:p-6"
                >
                  {isVideo ? (
                    <video
                      src={imgUrl.orig(photo.id)}
                      controls
                      autoPlay
                      playsInline
                      className="max-w-full max-h-full rounded-sm shadow-photo"
                      onPointerDownCapture={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <img
                      src={imgUrl.preview(photo.id, cacheVer(photo))}
                      alt={photo.filename}
                      draggable={false}
                      onError={(e) => {
                        const el = e.currentTarget;
                        const fallback = imgUrl.orig(photo.id);
                        if (el.src !== fallback) el.src = fallback;
                      }}
                      className="max-w-full max-h-full object-contain rounded-sm shadow-photo select-none"
                      style={{ filter: "saturate(1.02)" }}
                    />
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Desktop side arrows */}
              <AnimatePresence>
                {showChrome && !zoomed && index > 0 && (
                  <motion.button
                    key="prev"
                    type="button"
                    onClick={goPrev}
                    aria-label="Previous"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full"
                    style={{
                      background: "rgba(245,235,215,0.10)",
                      color: "#FAF5EC",
                      border: "1px solid rgba(245,235,215,0.20)",
                    }}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </motion.button>
                )}
                {showChrome && !zoomed && index < photos.length - 1 && (
                  <motion.button
                    key="next"
                    type="button"
                    onClick={goNext}
                    aria-label="Next"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full"
                    style={{
                      background: "rgba(245,235,215,0.10)",
                      color: "#FAF5EC",
                      border: "1px solid rgba(245,235,215,0.20)",
                    }}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom dots (mobile) / thumb strip (desktop) */}
            <AnimatePresence>
              {showChrome && (
                <motion.footer
                  key="botbar"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-0 inset-x-0 z-10 p-3 sm:p-4 flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(20,16,12,0.65), rgba(20,16,12,0))",
                  }}
                >
                  {/* Mobile dots */}
                  <div className="flex md:hidden gap-1.5">
                    {(() => {
                      const total = photos.length;
                      const window = 9;
                      const start = Math.max(0, Math.min(total - window, index - 4));
                      return Array.from({ length: Math.min(window, total) }).map((_, k) => {
                        const i = start + k;
                        const active = i === index;
                        return (
                          <button
                            key={i}
                            type="button"
                            aria-label={`Photo ${i + 1}`}
                            onClick={() => onIndexChange(i)}
                            className="w-1.5 h-1.5 rounded-full transition-all"
                            style={{
                              background: active ? "#FAF5EC" : "rgba(245,235,215,0.35)",
                              transform: active ? "scale(1.3)" : "scale(1)",
                            }}
                          />
                        );
                      });
                    })()}
                  </div>
                  {/* Desktop thumb strip */}
                  <div className="hidden md:flex gap-1.5 max-w-[640px] overflow-x-auto py-1 px-2">
                    {(() => {
                      const total = photos.length;
                      const window = 11;
                      const start = Math.max(0, Math.min(total - window, index - 5));
                      return Array.from({ length: Math.min(window, total) }).map((_, k) => {
                        const i = start + k;
                        const p = photos[i];
                        const active = i === index;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onIndexChange(i)}
                            className="shrink-0 rounded-sm overflow-hidden border transition-all"
                            style={{
                              width: active ? 56 : 44,
                              height: active ? 56 : 44,
                              borderColor: active ? "#FAF5EC" : "rgba(245,235,215,0.18)",
                              opacity: active ? 1 : 0.72,
                            }}
                            aria-label={p.filename}
                          >
                            <img
                              src={imgUrl.thumb(p.id, cacheVer(p))}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </button>
                        );
                      });
                    })()}
                  </div>
                </motion.footer>
              )}
            </AnimatePresence>

            {/* Info panel */}
            <AnimatePresence>
              {infoOpen && (
                <motion.aside
                  key="info"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.2 }}
                  className="
                    absolute z-20 paper-card
                    left-3 right-3 bottom-20 md:left-auto md:right-4 md:top-20 md:bottom-auto md:w-[320px]
                  "
                  style={{ background: "rgba(250,245,236,0.97)" }}
                >
                  <h3 className="m-0 font-serif italic text-base text-ink-soft pb-2 mb-2 border-b border-line">
                    about this picture
                  </h3>
                  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                    <dt className="text-ink-fade italic">taken</dt>
                    <dd className="text-ink-soft m-0">{formatDate(photo.taken_at)}</dd>
                    <dt className="text-ink-fade italic">uploaded</dt>
                    <dd className="text-ink-soft m-0">{formatDate(photo.uploaded_at)}</dd>
                    <dt className="text-ink-fade italic">size</dt>
                    <dd className="text-ink-soft m-0">{formatBytes(photo.size)}</dd>
                    <dt className="text-ink-fade italic">dimensions</dt>
                    <dd className="text-ink-soft m-0">
                      {photo.width && photo.height ? `${photo.width} × ${photo.height}` : "—"}
                    </dd>
                    <dt className="text-ink-fade italic">type</dt>
                    <dd className="text-ink-soft m-0">{photo.mime}</dd>
                    {exifSummary &&
                      (() => {
                        const make = exifSummary.Make as string | undefined;
                        const model = exifSummary.Model as string | undefined;
                        return make || model ? (
                          <>
                            <dt className="text-ink-fade italic">camera</dt>
                            <dd className="text-ink-soft m-0">
                              {[make, model].filter(Boolean).join(" ")}
                            </dd>
                          </>
                        ) : null;
                      })()}
                  </dl>
                </motion.aside>
              )}
            </AnimatePresence>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>

      <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[110] bg-ink/40 animate-fadeIn" />
          <AlertDialog.Content
            className="fixed z-[111] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 paper-card w-[min(420px,calc(100vw-32px))]"
            style={{ animation: "liftIn .2s cubic-bezier(.2,.7,.2,1)" }}
          >
            <AlertDialog.Title className="font-display text-3xl text-ink m-0 mb-1">
              Move to trash?
            </AlertDialog.Title>
            <AlertDialog.Description className="font-serif italic text-[14px] text-ink-fade m-0 mb-4">
              It will rest there for thirty days before it's gone.
            </AlertDialog.Description>
            <div className="flex items-center justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <button type="button" className="btn">Keep</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button type="button" className="btn btn-primary" onClick={handleDelete}>
                  Move to trash
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Dialog.Root>
  );
}
