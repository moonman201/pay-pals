/**
 * Fetches a photo so it can be sent to Claude as a base64 image block or
 * hashed. Only absolute http(s) URLs can be fetched; an app-relative path
 * such as /fixtures/clean-ps5/front.jpg is resolved against a photo base URL
 * first (factory option, else PAY_PALS_PHOTO_BASE_URL or NEXT_PUBLIC_APP_URL).
 */

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface FetchedImage {
  data: string;
  mediaType: ImageMediaType;
}

export type ImageFetcher = (url: string) => Promise<FetchedImage | null>;

const MAX_BYTES = 5 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;
const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function isFetchableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** The absolute URL to fetch for a photo, or null when it is relative and no base is known. */
export function resolvePhotoUrl(url: string, baseUrl?: string | null): string | null {
  if (isFetchableUrl(url)) return url;
  const base = baseUrl ?? process.env.PAY_PALS_PHOTO_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null;
  if (!base || !isFetchableUrl(base)) return null;
  try {
    return new URL(url, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return null;
  }
}

export const fetchImage: ImageFetcher = async (url) => {
  if (!isFetchableUrl(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const mediaType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!MEDIA_TYPES.includes(mediaType as ImageMediaType)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
    return { data: bytes.toString("base64"), mediaType: mediaType as ImageMediaType };
  } catch {
    return null;
  }
};

/** Resolves then fetches. Null when the URL cannot be resolved or the image cannot be loaded. */
export async function loadPhoto(url: string, fetcher: ImageFetcher = fetchImage, baseUrl?: string | null): Promise<FetchedImage | null> {
  const resolved = resolvePhotoUrl(url, baseUrl);
  if (!resolved) return null;
  return fetcher(resolved);
}
