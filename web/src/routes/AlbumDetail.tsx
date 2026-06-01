import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { GalleryView } from "./GalleryView";

export function AlbumDetail() {
  const { id } = useParams();
  const album = useLiveQuery(() => (id ? db.albums.get(id) : undefined), [id]);
  return (
    <GalleryView
      filter={{ album_id: id ?? null }}
      title={album?.name ?? "Album"}
      subtitle="a curated collection"
      emptyKind="album"
      emptyTitle="empty album"
      emptySub="add photos to this album from the viewer."
      uploadAlbumId={id ?? null}
    />
  );
}
