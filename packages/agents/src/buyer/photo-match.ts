/**
 * Finds card photos that are the same picture as one the caller already holds.
 * Hashes are perceptual (vision/phash.ts) and cached per URL for the life of
 * the pal. With no loadable images this finds nothing, so the rule stays
 * silent.
 *
 * The corpus is whatever the caller supplies and nothing more. This function
 * cannot tell where a picture appears in the world, only whether it is one of
 * the pictures it was handed, so every sentence written off a match has to say
 * so. See stock-photo.ts.
 */
import type { Photo } from "@pay-pals/contracts";
import type { PhotoMatch } from "../rules/types";
import { fetchImage as defaultFetchImage, loadPhoto, type ImageFetcher } from "../vision/fetch-image";
import { NEAR_DUPLICATE_DISTANCE, hammingDistance, imageHash } from "../vision/phash";

export interface KnownPhoto {
  url: string;
  /**
   * Where the photo came from, named in the flag's evidence so a reader can
   * see what it was compared against: "reference set: slab-front.jpg". It is
   * the only account of the corpus the buyer gets, so it stays specific.
   */
  source: string;
}

export interface PhotoMatchDeps {
  knownPhotos: KnownPhoto[];
  fetchImage?: ImageFetcher;
  photoBaseUrl?: string | null;
  /** url -> hash, or null when the image could not be loaded or decoded. Shared across calls. */
  hashCache?: Map<string, string | null>;
}

export async function hashPhotoUrl(url: string, deps: PhotoMatchDeps): Promise<string | null> {
  const cache = deps.hashCache;
  if (cache?.has(url)) return cache.get(url) ?? null;
  const image = await loadPhoto(url, deps.fetchImage ?? defaultFetchImage, deps.photoBaseUrl);
  const hash = image ? imageHash(Buffer.from(image.data, "base64"), image.mediaType) : null;
  cache?.set(url, hash);
  return hash;
}

export async function findReusedPhotos(photos: Photo[], deps: PhotoMatchDeps): Promise<PhotoMatch[]> {
  if (deps.knownPhotos.length === 0 || photos.length === 0) return [];
  const matches: PhotoMatch[] = [];
  for (const photo of photos) {
    const hash = await hashPhotoUrl(photo.url, deps);
    if (!hash) continue;
    let best: PhotoMatch | null = null;
    for (const known of deps.knownPhotos) {
      if (known.url === photo.url) continue;
      const knownHash = await hashPhotoUrl(known.url, deps);
      if (!knownHash) continue;
      const distance = hammingDistance(hash, knownHash);
      if (distance <= NEAR_DUPLICATE_DISTANCE && (!best || distance < best.distance)) best = { photo, source: known.source, distance };
    }
    if (best) matches.push(best);
  }
  return matches;
}
