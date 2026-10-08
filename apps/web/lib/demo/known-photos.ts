/**
 * Photos the Buyer Pal already knows, so a listing that reuses one of them
 * is caught by an image match: the finished demo deals' card photos, plus
 * any file under public/fixtures/reference (served at /fixtures/reference/).
 * URLs are made absolute so a pal on the server can fetch them.
 */
import { ALL_FIXTURES } from "@pay-pals/contracts";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { absoluteUrl } from "../deal/photo-urls";

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

/** The known-photo list for createBuyerPal. `base` is the public URL the photos resolve against, or null to leave them relative. */
export function buildKnownPhotos(base: string | null, publicDir: string): KnownPhotoEntry[] {
  const seen = new Set<string>();
  const out: KnownPhotoEntry[] = [];
  const add = (url: string, source: string) => {
    const absolute = absoluteUrl(url, base);
    if (seen.has(absolute)) return;
    seen.add(absolute);
    out.push({ url: absolute, source });
  };
  for (const fixture of ALL_FIXTURES) {
    for (const card of fixture.cards) {
      for (const photo of card.photos) add(photo.url, `the ${fixture.id} demo deal`);
    }
  }
  for (const file of referencePhotoFiles(publicDir)) add(`/fixtures/reference/${file}`, `reference set: ${file}`);
  return out;
}
