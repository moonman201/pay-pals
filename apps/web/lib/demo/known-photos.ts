/**
 * Photos the Buyer Pal already knows, so a listing that reuses one of them
 * is caught by an image match. The list is the reference folder and nothing
 * else: every file under public/fixtures/reference, served at
 * /fixtures/reference/. URLs are made absolute so a pal on the server can
 * fetch them.
 *
 * The demo deals' own card photos are deliberately not in here. The empty
 * box deal reuses the clean deal's console and box pictures because it is
 * the same physical console, so matching the demo deals against each other
 * would raise a reused-photo flag on an honest deal. The scam listing's
 * picture sits in the reference folder, so that deal still matches.
 */
import { fetchImage, type ImageFetcher } from "@pay-pals/agents";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { absoluteUrl } from "../deal/photo-urls";

/**
 * Where a reference photo lives when no public URL is configured. The pals
 * only fetch absolute http(s) URLs, and startup has no request origin, so a
 * relative reference stayed unfetchable and the reused-photo check went
 * dead. These URLs never leave the process: `localAwareFetcher` reads them
 * from public/ on disk. Any other URL goes to the normal fetcher.
 */
export const LOCAL_REFERENCE_ORIGIN = "http://reference.pay-pals.invalid";

const MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export function localAwareFetcher(publicDir: string, fallback: ImageFetcher = fetchImage): ImageFetcher {
  return async (url) => {
    if (!url.startsWith(`${LOCAL_REFERENCE_ORIGIN}/fixtures/reference/`)) return fallback(url);
    const name = path.basename(decodeURIComponent(new URL(url).pathname));
    const mediaType = MEDIA_TYPES[path.extname(name).toLowerCase()];
    const file = path.join(publicDir, "fixtures", "reference", name);
    if (!mediaType || !existsSync(file)) return null;
    return { data: readFileSync(file).toString("base64"), mediaType };
  };
}

export interface KnownPhotoEntry {
  url: string;
  source: string;
}

const IMAGE_FILE = /\.(jpe?g|png|webp|gif)$/i;

export function referencePhotoFiles(publicDir: string): string[] {
  const dir = path.join(publicDir, "fixtures", "reference");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => IMAGE_FILE.test(name))
    .sort();
}

/** The known-photo list for createBuyerPal. `base` is the public URL the photos resolve against, or null to read them from disk. */
export function buildKnownPhotos(base: string | null, publicDir: string): KnownPhotoEntry[] {
  const seen = new Set<string>();
  const out: KnownPhotoEntry[] = [];
  const add = (url: string, source: string) => {
    const absolute = absoluteUrl(url, base ?? LOCAL_REFERENCE_ORIGIN);
    if (seen.has(absolute)) return;
    seen.add(absolute);
    out.push({ url: absolute, source });
  };
  for (const file of referencePhotoFiles(publicDir)) add(`/fixtures/reference/${file}`, `reference set: ${file}`);
  return out;
}
