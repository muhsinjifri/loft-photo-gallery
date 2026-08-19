import { GalleryView } from "./GalleryView";
import { ScopeToggle } from "../components/ScopeToggle";
import { useScope } from "../scope";

export function Home() {
  const { scope } = useScope();
  return (
    <GalleryView
      filter={{ scope }}
      title="All pictures"
      subtitle={scope === "ours" ? "everything you two have kept" : "everything you've kept"}
      emptyKind="photos"
      emptyTitle={scope === "ours" ? "nothing shared yet" : "no pictures yet"}
      emptySub={
        scope === "ours"
          ? "share an album, and whatever's in it shows up here."
          : "drag a photo in, or tap the plus."
      }
      rightSlot={<ScopeToggle />}
    />
  );
}
