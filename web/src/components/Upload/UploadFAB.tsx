import { useRef } from "react";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useUpload } from "./UploadProvider";

export function UploadFAB() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { addFiles, hasActive } = useUpload();

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
      <motion.button
        type="button"
        aria-label="Add pictures"
        onClick={() => inputRef.current?.click()}
        whileTap={{ scale: 0.92 }}
        whileHover={{ y: -1 }}
        className="md:hidden fixed right-5 bottom-20 z-40 w-14 h-14 rounded-full bg-accent text-paper-tint shadow-lift border border-accent-deep flex items-center justify-center"
        style={{ boxShadow: "0 8px 24px rgba(79,102,73,0.38), inset 0 1px 0 rgba(255,250,240,0.3)" }}
      >
        <Plus className="w-7 h-7" strokeWidth={2} />
        {hasActive && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-paper-tint/40"
            animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </motion.button>
    </>
  );
}
