import { ALL_FIXTURES } from "@pay-pals/contracts";
import { isFetchableUrl } from "@pay-pals/agents";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildKnownPhotos, LOCAL_REFERENCE_ORIGIN, localAwareFetcher, referencePhotoFiles } from "./known-photos";

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

  it("points at the local reader when no base is known, so the check works without NEXT_PUBLIC_APP_URL", async () => {
    reference("slab-listing.jpg");
    const real = path.resolve(__dirname, "../../public/fixtures/reference/slab-listing.jpg");
    writeFileSync(path.join(publicDir, "fixtures", "reference", "slab-listing.jpg"), readFileSync(real));
    const [entry] = buildKnownPhotos(null, publicDir);
    expect(entry).toEqual({ url: `${LOCAL_REFERENCE_ORIGIN}/fixtures/reference/slab-listing.jpg`, source: "reference set: slab-listing.jpg" });
    expect(isFetchableUrl(entry!.url)).toBe(true);
    const image = await localAwareFetcher(publicDir, async () => null)(entry!.url);
    expect(image?.mediaType).toBe("image/jpeg");
    expect(Buffer.from(image!.data, "base64").equals(readFileSync(real))).toBe(true);
  });

  it("sends any other URL to the normal fetcher and finds nothing for a missing reference file", async () => {
    const seen: string[] = [];
    const fetcher = localAwareFetcher(publicDir, async (url) => (seen.push(url), null));
    await fetcher("https://example.com/a.jpg");
    expect(seen).toEqual(["https://example.com/a.jpg"]);
    expect(await fetcher(`${LOCAL_REFERENCE_ORIGIN}/fixtures/reference/nope.jpg`)).toBeNull();
  });

  it("copes with no reference folder", () => {
    expect(referencePhotoFiles(path.join(publicDir, "missing"))).toEqual([]);
    expect(buildKnownPhotos(null, path.join(publicDir, "missing"))).toEqual([]);
  });
});
