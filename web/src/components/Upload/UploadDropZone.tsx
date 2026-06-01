import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UploadDropHint } from "../illustrations";
import { useUpload } from "./UploadProvider";

export function UploadDropZone() {
  const { addFiles } = useUpload();
  const [over, setOver] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length) addFiles(files, {});
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles]);

  return (
    <AnimatePresence>
      {over && (
        <motion.div
          key="drop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="hidden md:flex fixed inset-0 z-[90] pointer-events-none items-center justify-center"
          style={{ background: "rgba(244, 239, 230, 0.78)", backdropFilter: "blur(2px)" }}
        >
          <div
            className="rounded-lg px-12 py-10 flex flex-col items-center gap-3 text-ink-soft"
            style={{
              border: "2px dashed rgba(107,130,102,0.58)",
              background: "rgba(250,245,236,0.85)",
            }}
          >
            <UploadDropHint className="w-24 h-24 text-ink-soft" />
            <p className="font-display text-3xl text-ink m-0">drop them in</p>
            <p className="italic text-sm text-ink-fade m-0">we'll handle the rest</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
