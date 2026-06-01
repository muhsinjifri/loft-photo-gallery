import { GalleryView } from "./GalleryView";

export function Home() {
  return (
    <GalleryView
      filter={{}}
      title="All pictures"
      subtitle="everything you've kept"
      emptyKind="photos"
      emptyTitle="no pictures yet"
      emptySub="drag a photo in, or tap the plus."
    />
  );
}
