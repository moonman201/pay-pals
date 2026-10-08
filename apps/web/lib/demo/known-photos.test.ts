import { ALL_FIXTURES, fakeSlab } from "@pay-pals/contracts";
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

  it("lists every demo deal card photo once, as an absolute URL, with the scenario as its source", () => {
    const list = buildKnownPhotos("https://pay-pals.example", publicDir);
    const expected = new Set(ALL_FIXTURES.flatMap((f) => f.cards.flatMap((c) => c.photos.map((p) => `https://pay-pals.example${p.url}`))));
    expect(new Set(list.map((p) => p.url))).toEqual(expected);
    expect(list.length).toBe(expected.size);
    const slab = list.find((p) => p.url.endsWith(fakeSlab.cards[0]!.photos[0]!.url));
    expect(slab?.source).toBe("the fake-slab demo deal");
    for (const p of list) expect(p.url).toMatch(/^https:\/\/pay-pals\.example\/fixtures\//);
  });

  it("adds image files from public/fixtures/reference with the file name as the source, and ignores other files", () => {
    const ref = path.join(publicDir, "fixtures", "reference");
    mkdirSync(ref, { recursive: true });
    writeFileSync(path.join(ref, "slab-front.jpg"), "");
    writeFileSync(path.join(ref, "notes.txt"), "");
    writeFileSync(path.join(ref, "box.PNG"), "");
    expect(referencePhotoFiles(publicDir)).toEqual(["box.PNG", "slab-front.jpg"]);
    const list = buildKnownPhotos("https://pay-pals.example", publicDir);
    expect(list).toContainEqual({ url: "https://pay-pals.example/fixtures/reference/slab-front.jpg", source: "reference set: slab-front.jpg" });
    expect(list.some((p) => p.url.endsWith("notes.txt"))).toBe(false);
  });

  it("keeps URLs relative when no base is known, and copes with no reference folder", () => {
    const list = buildKnownPhotos(null, publicDir);
    expect(list.every((p) => p.url.startsWith("/fixtures/"))).toBe(true);
    expect(referencePhotoFiles(path.join(publicDir, "missing"))).toEqual([]);
  });
});
