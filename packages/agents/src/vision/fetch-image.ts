/**
 * Fetches a photo so it can be sent to Claude as a base64 image block. Only
 * absolute http(s) URLs are fetchable; app-relative fixture paths are not.
 */

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface FetchedImage {
  data: string;
  mediaType: ImageMediaType;
}

export type ImageFetcher = (url: string) => Promise<FetchedImage | null>;

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function isFetchableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export const fetchImage: ImageFetcher = async (url) => {
  if (!isFetchableUrl(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
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
