/**
 * Feeds a real image file to a pal's vision read without a web server.
 *
 * `fetchImage` in packages/agents only speaks http(s): `isFetchableUrl`
 * rejects a file:// URL, so a photo pointed at one is never loaded and the
 * pal quietly falls back to the caption. The pals publish a `fetchImage`
 * option for this, so a test gives its photos http(s) URLs that go nowhere
 * and answers them here from disk.
 */
import { readFileSync } from "node:fs";
import type { ImageFetcher } from "@pay-pals/agents";

/** A host that resolves nowhere, so a missed mapping fails loudly instead of hitting the network. */
export const LOCAL_PHOTO_BASE = "https://pay-pals.test";

const MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** Answers each URL in `files` with that file on disk, and every other URL with null. */
export function fileImageFetcher(files: Record<string, string>): ImageFetcher {
  return async (url) => {
    const path = files[url];
    if (!path) return null;
    const mediaType = MEDIA_TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
    if (!mediaType) return null;
    return { data: readFileSync(path).toString("base64"), mediaType };
  };
}
