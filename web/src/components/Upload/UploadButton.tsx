import { useRef } from "react";
import { Plus } from "lucide-react";
import { useUpload } from "./UploadProvider";

interface Props {
  albumId?: string | null;
  label?: string;
  className?: string;
}

export function UploadButton({ albumId = null, label = "Add pictures", className = "" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { addFiles } = useUpload();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files ?? [], { albumId });
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        type="button"
        className={`btn btn-primary ${className}`}
        onClick={() => inputRef.current?.click()}
      >
        <Plus className="w-4 h-4 -ml-1" strokeWidth={2} />
        {label}
      </button>
    </>
  );
}
