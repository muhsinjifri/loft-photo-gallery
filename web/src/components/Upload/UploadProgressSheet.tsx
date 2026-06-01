import { AnimatePresence, motion } from "framer-motion";
import { X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useUpload, type UploadItem } from "./UploadProvider";

function StatusIcon({ status }: { status: UploadItem["status"] }) {
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-accent-deep" />;
  if (status === "error") return <AlertCircle className="w-4 h-4 text-red-700" />;
  if (status === "preparing" || status === "uploading" || status === "saving")
    return <Loader2 className="w-4 h-4 text-ink-fade animate-spin" />;
  return <span className="w-4 h-4 rounded-full border border-ink-trace/70 inline-block" />;
}

function statusLabel(it: UploadItem) {
  if (it.status === "preparing") return "preparing…";
  if (it.status === "uploading") {
    if (typeof it.progress === "number") return `${Math.round(it.progress * 100)}%`;
    return "uploading…";
  }
  if (it.status === "saving") return "saving…";
  if (it.status === "done") return "kept";
  if (it.status === "error") return it.error ?? "failed";
  return "queued";
}

export function UploadProgressSheet() {
  const { items, isOpen, dismiss, clearCompleted, hasActive } = useUpload();
  const show = isOpen && items.length > 0;

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          key="upload-sheet"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          role="status"
          aria-label="Uploads"
          className="
            fixed z-50 paper-card max-h-[60vh] overflow-y-auto
            bottom-24 left-3 right-3
            md:bottom-auto md:left-auto md:top-20 md:right-6 md:w-[340px]
          "
          style={{ paddingTop: 12, paddingBottom: 8 }}
        >
          <header className="flex items-center justify-between pb-2 mb-2 border-b border-line">
            <h3 className="m-0 font-serif italic font-medium text-sm text-ink-soft">
              uploads
            </h3>
            <div className="flex items-center gap-1">
              {!hasActive && items.some((i) => i.status === "done") && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="btn btn-ghost text-xs"
                  style={{ padding: "4px 10px" }}
                >
                  clear
                </button>
              )}
              <button
                type="button"
                className="btn btn-icon"
                onClick={dismiss}
                aria-label="Close uploads"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>
          <ul className="m-0 p-0 list-none">
            {items.map((it) => {
              // Notes are only set when a video fell back to the placeholder.
              const isPlaceholder = !!it.note;
              return (
                <li
                  key={it.id}
                  className="relative py-1.5 text-[13px] border-b border-dashed border-line last:border-b-0 overflow-hidden"
                >
                  {it.status === "uploading" && typeof it.progress === "number" && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 -z-0 bg-accent/10 transition-[width] duration-150"
                      style={{ width: `${Math.max(2, it.progress * 100)}%` }}
                    />
                  )}
                  <div className="relative z-10 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <StatusIcon status={it.status} />
                      <span className="truncate text-ink-soft" title={it.name}>
                        {it.name}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 italic text-[12.5px] tabular-nums ${
                        it.status === "done"
                          ? "text-accent-deep not-italic"
                          : it.status === "error"
                          ? "text-red-700 not-italic"
                          : "text-ink-fade"
                      }`}
                    >
                      {statusLabel(it)}
                    </span>
                  </div>
                  {it.note && (
                    <p
                      className={`relative z-10 m-0 mt-0.5 pl-6 text-[11px] leading-snug break-words ${
                        isPlaceholder ? "text-amber-700" : "text-ink-trace"
                      }`}
                    >
                      {it.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
