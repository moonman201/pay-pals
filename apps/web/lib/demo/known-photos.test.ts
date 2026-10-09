import { ALL_FIXTURES } from "@pay-pals/contracts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildKnownPhotos, referencePhotoFiles } from "./known-photos";

describe("buildKnownPhotos", () => {
  let publicDir: string;
  beforeEach(() => {
    publicDir = mkdtempSync(path.join(tmpdir(), "pay-pals-public-"));
  });
  afterEach(() => rmSync(publicDir, { recursive: true, force: true }));

  function reference(...names: string[]): void {
    const dir = path.join(publicDir, "fixtures", "reference");
    mkdirSync(dir, { recursive: true });
    for (const name of names) writeFileSync(path.join(dir, name), "");
  }

  it("is the reference folder and nothing else, with the file name as the source", () => {
    reference("slab-listing.jpg", "notes.txt", "box.PNG");
    expect(referencePhotoFiles(publicDir)).toEqual(["box.PNG", "slab-listing.jpg"]);
    const list = buildKnownPhotos("https://pay-pals.example", publicDir);
    expect(list).toEqual([
      { url: "https://pay-pals.example/fixtures/reference/box.PNG", source: "reference set: box.PNG" },
      { url: "https://pay-pals.example/fixtures/reference/slab-listing.jpg", source: "reference set: slab-listing.jpg" },
    ]);
    expect(list.some((p) => p.url.endsWith("notes.txt"))).toBe(false);
  });

  it("never knows a demo deal's own card photos, so a deal that honestly reuses another's picture is not flagged", () => {
    // The empty box deal shows the same console and box as the clean deal: the same physical console.
    reference("slab-listing.jpg");
    const list = buildKnownPhotos("https://pay-pals.example", publicDir);
    const cardPhotos = ALL_FIXTURES.flatMap((f) => f.cards.flatMap((c) => c.photos.map((p) => p.url)));
    expect(cardPhotos.length).toBeGreaterThan(0);
    for (const url of cardPhotos) expect(list.some((known) => known.url.endsWith(url))).toBe(false);
  });

  it("keeps URLs relative when no base is known, and copes with no reference folder", () => {
    reference("slab-listing.jpg");
    expect(buildKnownPhotos(null, publicDir)).toEqual([{ url: "/fixtures/reference/slab-listing.jpg", source: "reference set: slab-listing.jpg" }]);
    expect(referencePhotoFiles(path.join(publicDir, "missing"))).toEqual([]);
    expect(buildKnownPhotos(null, path.join(publicDir, "missing"))).toEqual([]);
  });
});
