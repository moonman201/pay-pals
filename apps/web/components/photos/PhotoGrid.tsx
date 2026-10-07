import type { Photo } from "@pay-pals/contracts";
import { PhotoFrame } from "./PhotoFrame";

export function PhotoGrid({ photos, size = "md", empty = "No photos yet." }: { photos: Photo[]; size?: "sm" | "md"; empty?: string }) {
  if (photos.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const cols = size === "sm" ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-3";
  return (
    <div className={cols}>
      {photos.map((p) => (
        <PhotoFrame key={p.url} photo={p} size={size} />
      ))}
    </div>
  );
}
