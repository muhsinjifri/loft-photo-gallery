import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { tinykeys } from "tinykeys";
import { useUpload } from "./Upload";
import { ShortcutsDialog } from "./ShortcutsDialog";

function isEditingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { addFiles } = useUpload();
  const [helpOpen, setHelpOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const guard = (fn: () => void) => (e: KeyboardEvent) => {
      if (isEditingTarget(e)) return;
      e.preventDefault();
      fn();
    };

    const unsubscribe = tinykeys(window, {
      "g h": guard(() => navigate("/")),
      "g c": guard(() => navigate("/calendar")),
      "g a": guard(() => navigate("/albums")),
      "g t": guard(() => navigate("/trash")),
      "g s": guard(() => navigate("/settings")),
      u: guard(() => inputRef.current?.click()),
      "Shift+?": guard(() => setHelpOpen(true)),
      "?": guard(() => setHelpOpen(true)),
      "/": guard(() => {
        // Reserved for search (v2)
      }),
    });

    return unsubscribe;
  }, [navigate]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files ?? [], {});
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      {children}
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
