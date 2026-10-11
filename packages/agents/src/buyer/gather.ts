/**
 * The four independent lookups a review needs before it can think: the market
 * price, the grading cert, the photo reads and the reused-photo check.
 *
 * They do not depend on each other, so they run together rather than one after
 * another, and each reports itself the moment it lands (PLAN.md Decision 19).
 * The model call is the one thing that cannot join them, because it is told
 * what all four found.
 *
 * Every lookup swallows its own failure. A review with no price is still a
 * review, and the reasons say what was missing; a review that throws because
 * a price lookup timed out is not. That is why each returns a result rather
 * than rejecting, and why Promise.all over them is safe.
 */
import type { CertLookup, CertRecord, ItemCard, MarketPriceLookup, PriceCheck, ReviewProgress } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import type { ImageFetcher } from "../vision/fetch-image";
import { readPhotos, type PhotoReading } from "../vision/read-photo";
import { findReusedPhotos, type PhotoMatchDeps } from "./photo-match";
import type { PhotoMatch } from "../rules";

/** Reports a finding. Never throws: see emitter() in progress.ts. */
export type Emit = (event: ReviewProgress) => void;

function warn(what: string, error: unknown): void {
  console.warn(`[pay-pals agents] ${what} failed: ${error instanceof Error ? error.message : String(error)}`);
}

export interface PriceResult {
  priceCheck: PriceCheck | null;
}

export async function gatherPrice(card: ItemCard | null, lookup: MarketPriceLookup, query: (c: ItemCard) => { brand: string; model: string; condition: string }, emit: Emit): Promise<PriceResult> {
  if (!card) return { priceCheck: null };
  emit({ kind: "stage", stage: "checking the market price" });
  try {
    const priceCheck = await lookup.priceRange(query(card));
    emit({ kind: "priceCheck", priceCheck });
    return { priceCheck };
  } catch (error) {
    warn("price lookup", error);
    emit({ kind: "priceCheck", priceCheck: null });
    return { priceCheck: null };
  }
}

export interface CertResult {
  certRecord: CertRecord | null;
  /** True when the grader was asked and could not be reached, which is not the same as no cert. */
  lookupFailed: boolean;
}

export async function gatherCert(card: ItemCard | null, lookup: CertLookup | null | undefined, emit: Emit): Promise<CertResult> {
  if (!card?.certNumber || !lookup) return { certRecord: null, lookupFailed: false };
  emit({ kind: "stage", stage: "looking up the grading cert" });
  try {
    return { certRecord: await lookup.lookup(card.certNumber), lookupFailed: false };
  } catch (error) {
    warn("cert lookup", error);
    return { certRecord: null, lookupFailed: true };
  }
}

export interface PhotoMatchResult {
  photoMatches: PhotoMatch[];
  /** False when there was nothing to compare against, so the review must not claim it looked. */
  ran: boolean;
}

export async function gatherPhotoMatches(card: ItemCard | null, deps: PhotoMatchDeps | null | undefined, emit: Emit): Promise<PhotoMatchResult> {
  if (!card || !deps || deps.knownPhotos.length === 0) return { photoMatches: [], ran: false };
  emit({ kind: "stage", stage: "comparing the photos against other listings" });
  try {
    return { photoMatches: await findReusedPhotos(card.photos, deps), ran: true };
  } catch (error) {
    warn("photo match", error);
    return { photoMatches: [], ran: false };
  }
}

export interface ReadPhotosDeps {
  client: ClaudeClient | null;
  fetchImage?: ImageFetcher;
  photoBaseUrl?: string | null;
}

/** Reads every card photo, the photos themselves concurrently, reporting each as it lands. */
export async function gatherPhotoReads(card: ItemCard | null, deps: ReadPhotosDeps, emit: Emit): Promise<PhotoReading[]> {
  if (!deps.client || !card || card.photos.length === 0) return [];
  emit({ kind: "stage", stage: card.photos.length === 1 ? "reading the photo" : `reading the ${card.photos.length} photos` });
  return readPhotos(
    card.photos,
    { client: deps.client, fetchImage: deps.fetchImage, photoBaseUrl: deps.photoBaseUrl, hints: { brand: card.brand, model: card.model } },
    (reading) => emit({ kind: "photoRead", url: reading.photo.url, readable: reading.imageStatus === "read" }),
  );
}
