"use client";

import type { Photo } from "@pay-pals/contracts";
import { useEffect, useState } from "react";

/**
 * One photo with its description. The URL is probed in an effect rather
 * than with onError, because a fast 404 fires before React hydrates and the
 * handler would be missed. When the file is missing (the demo photos are not
 * in the repo yet) a neutral placeholder shows the description instead.
 */
export function PhotoFrame({ photo, size = "md" }: { photo: Photo; size?: "sm" | "md" | "lg" }) {
  const [status, setStatus] = useState<"loading" | "ok" | "failed">("loading");
  const box = size === "sm" ? "h-20 w-20" : size === "lg" ? "h-56 w-full" : "h-36 w-full";

  useEffect(() => {
    let alive = true;
    const probe = new Image();
    probe.onload = () => alive && setStatus("ok");
    probe.onerror = () => alive && setStatus("failed");
    probe.src = photo.url;
    return () => {
      alive = false;
    };
  }, [photo.url]);

  return (
    <figure className="min-w-0">
      {status === "ok" ? (
        // Plain img on purpose: photo URLs come from users and fixtures, not a fixed host list.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt={photo.whatItShows} className={`${box} rounded-lg border border-line object-cover`} />
      ) : (
        <div
          role="img"
          aria-label={photo.whatItShows}
          data-testid="photo-placeholder"
          className={`${box} flex items-center justify-center rounded-lg border border-dashed border-line bg-wash p-2 text-center text-xs text-muted`}
        >
          <span className="line-clamp-4">{size === "sm" ? "Photo" : photo.whatItShows}</span>
        </div>
      )}
      {size !== "sm" ? <figcaption className="mt-1 text-xs text-muted">{photo.whatItShows}</figcaption> : null}
    </figure>
  );
}
