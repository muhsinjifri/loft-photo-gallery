import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { prepareUpload } from "../../thumb";
import { api } from "../../api";
import { db } from "../../db";
import { MAX_UPLOAD_BYTES } from "@loft/shared";

export type UploadStatus = "pending" | "preparing" | "uploading" | "saving" | "done" | "error";

export interface UploadItem {
  id: string;
  name: string;
  status: UploadStatus;
  progress?: number; // 0..1, only meaningful during "uploading"
  error?: string;
  note?: string; // diagnostic: which path produced the thumbnail
}

interface AddFilesOptions {
  albumId?: string | null;
}

interface UploadContextValue {
  items: UploadItem[];
  isOpen: boolean;
  addFiles: (files: FileList | File[], opts?: AddFilesOptions) => void;
  dismiss: () => void;
  clearCompleted: () => void;
  hasActive: boolean;
}

const UploadContext = createContext<UploadContextValue | null>(null);

let nextId = 0;
const localId = () => `up-${Date.now()}-${nextId++}`;

export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((s) => s.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const runUpload = useCallback(
    async (file: File, id: string, albumId: string | null | undefined) => {
      const t0 = performance.now();
      try {
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error(`too large (>${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`);
        }
        updateItem(id, { status: "preparing" });
        const t1 = performance.now();
        const prepared = await prepareUpload(file);
        const tPrep = performance.now() - t1;
        if (prepared.thumbNote) updateItem(id, { note: prepared.thumbNote });

        updateItem(id, { status: "uploading", progress: 0 });
        const t2 = performance.now();
        const { photo } = await api.upload(
          prepared.original,
          prepared.thumb,
          prepared.preview,
          prepared.meta,
          (fraction) => updateItem(id, { progress: fraction }),
        );
        const tNet = performance.now() - t2;

        updateItem(id, { status: "saving", progress: 1 });
        if (albumId) {
          await api.setAlbum(photo.id, albumId);
          photo.album_id = albumId;
        }
        await db.photos.put(photo);
        updateItem(id, { status: "done" });
        console.info(
          `[upload] "${file.name}" ${(file.size / 1024 / 1024).toFixed(1)}MB — ` +
            `prepare ${tPrep.toFixed(0)}ms, network ${tNet.toFixed(0)}ms, total ${(
              performance.now() - t0
            ).toFixed(0)}ms`,
        );
      } catch (e) {
        console.error(`[upload] failed "${file.name}"`, e);
        updateItem(id, {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
        // Always surface errors — re-open the panel if it was dismissed.
        setIsOpen(true);
      }
    },
    [updateItem],
  );

  const addFiles = useCallback(
    (input: FileList | File[], opts: AddFilesOptions = {}) => {
      const files = Array.from(input);
      if (files.length === 0) return;
      const newItems: UploadItem[] = files.map((f) => ({
        id: localId(),
        name: f.name,
        status: "pending",
      }));
      setItems((s) => [...newItems, ...s]);
      setIsOpen(true);

      // Sequential queue (preserves prior single-file-at-a-time pacing)
      queueRef.current = queueRef.current.then(async () => {
        for (let i = 0; i < files.length; i++) {
          await runUpload(files[i], newItems[i].id, opts.albumId ?? null);
        }
      });
    },
    [runUpload],
  );

  const dismiss = useCallback(() => setIsOpen(false), []);

  const clearCompleted = useCallback(() => {
    setItems((s) => s.filter((it) => it.status !== "done"));
  }, []);

  const hasActive = items.some(
    (it) =>
      it.status === "pending" ||
      it.status === "preparing" ||
      it.status === "uploading" ||
      it.status === "saving",
  );

  return (
    <UploadContext.Provider
      value={{ items, isOpen, addFiles, dismiss, clearCompleted, hasActive }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside <UploadProvider>");
  return ctx;
}
