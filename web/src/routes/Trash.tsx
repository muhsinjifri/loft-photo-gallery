import { GalleryView } from "./GalleryView";

export function Trash() {
  return (
    <GalleryView
      filter={{ trash: true }}
      title="Trash"
      subtitle="resting for thirty days"
      emptyKind="trash"
      emptyTitle="nothing in the trash"
      emptySub="deleted photos rest here for 30 days."
      hideUpload
    />
  );
}
