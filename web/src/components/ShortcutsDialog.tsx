import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Underline } from "./flourishes";

interface Shortcut {
  keys: string[];
  label: string;
}

const SECTIONS: Array<{ title: string; items: Shortcut[] }> = [
  {
    title: "Navigate",
    items: [
      { keys: ["g", "h"], label: "Go to all photos" },
      { keys: ["g", "c"], label: "Go to calendar" },
      { keys: ["g", "a"], label: "Go to albums" },
      { keys: ["g", "t"], label: "Go to trash" },
      { keys: ["g", "s"], label: "Go to settings" },
    ],
  },
  {
    title: "Action",
    items: [
      { keys: ["u"], label: "Add pictures" },
      { keys: ["/"], label: "Search — coming soon" },
      { keys: ["?"], label: "Show this dialog" },
    ],
  },
  {
    title: "In the viewer",
    items: [
      { keys: ["←", "→"], label: "Previous / next photo" },
      { keys: ["i"], label: "Toggle info panel" },
      { keys: ["Esc"], label: "Close viewer" },
      { keys: ["Del"], label: "Move to trash" },
    ],
  },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-block min-w-[24px] text-center px-1.5 py-0.5 rounded text-[12px] font-mono text-ink-soft"
      style={{
        background: "var(--c-paper, #EDE5D6)",
        border: "1px solid rgba(58,50,40,0.18)",
        boxShadow: "0 1px 0 rgba(60,50,40,0.12)",
      }}
    >
      {children}
    </kbd>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-ink/40 animate-fadeIn" />
        <Dialog.Content
          className="fixed z-[101] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 paper-card w-[min(520px,calc(100vw-32px))] max-h-[calc(100vh-64px)] overflow-y-auto"
          style={{ animation: "liftIn .2s cubic-bezier(.2,.7,.2,1)" }}
        >
          <div className="flex items-start justify-between mb-2 relative">
            <div>
              <Dialog.Title className="font-display text-3xl text-ink m-0 leading-none">
                Shortcuts
              </Dialog.Title>
              <Underline className="block w-24 h-1.5 mt-1 text-accent/60" />
            </div>
            <Dialog.Close asChild>
              <button type="button" className="btn btn-icon" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="font-serif italic text-[13.5px] text-ink-fade m-0 mb-4">
            a few quiet ways to move through the loft.
          </Dialog.Description>

          <div className="space-y-5">
            {SECTIONS.map((sec) => (
              <section key={sec.title}>
                <h3 className="font-serif italic text-[13px] text-ink-fade font-medium lowercase tracking-[0.04em] m-0 mb-2">
                  {sec.title}
                </h3>
                <ul className="m-0 p-0 list-none divide-y divide-line">
                  {sec.items.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between py-2 text-[14px] text-ink-soft"
                    >
                      <span>{s.label}</span>
                      <span className="flex items-center gap-1">
                        {s.keys.map((k, j) => (
                          <span key={j} className="flex items-center gap-1">
                            {j > 0 && (
                              <span className="text-ink-trace text-[11px]">then</span>
                            )}
                            <Key>{k}</Key>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
