import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyDemoPhotos, WEB_IMAGE } from "./copy-demo-photos.mjs";

describe("copyDemoPhotos", () => {
  let root: string;
  let source: string;
  let target: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "pay-pals-photos-"));
    source = path.join(root, "assets");
    target = path.join(root, "public", "fixtures");
    for (const dir of ["clean-ps5", "empty-box", "fake-slab", "reference"]) mkdirSync(path.join(source, dir), { recursive: true });
    writeFileSync(path.join(source, "clean-ps5", "console-serial-closeup.jpg"), "a");
    writeFileSync(path.join(source, "clean-ps5", "box-label.JPG"), "b");
    writeFileSync(path.join(source, "empty-box", "arrival-box-open-empty.jpg"), "c");
    writeFileSync(path.join(source, "fake-slab", "slab-front.jpg"), "d");
    writeFileSync(path.join(source, "reference", "slab-listing.jpg"), "e");
    // The tree also holds the originals and the notes, which are not demo photos.
    writeFileSync(path.join(source, "IMG_5072.HEIC"), "f");
    writeFileSync(path.join(source, "SHOTLIST.md"), "g");
    writeFileSync(path.join(source, "clean-ps5", "notes.txt"), "h");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("copies every scenario folder and the reference folder, keeping the shape", () => {
    const { copied, folders } = copyDemoPhotos(source, target);
    expect(folders).toEqual(["clean-ps5", "empty-box", "fake-slab", "reference"]);
    expect(copied.sort()).toEqual(
      [
        path.join("clean-ps5", "box-label.JPG"),
        path.join("clean-ps5", "console-serial-closeup.jpg"),
        path.join("empty-box", "arrival-box-open-empty.jpg"),
        path.join("fake-slab", "slab-front.jpg"),
        path.join("reference", "slab-listing.jpg"),
      ].sort(),
    );
    expect(existsSync(path.join(target, "clean-ps5", "console-serial-closeup.jpg"))).toBe(true);
    expect(existsSync(path.join(target, "reference", "slab-listing.jpg"))).toBe(true);
  });

  it("leaves the originals and the notes behind, so public/ holds only what a browser can show", () => {
    const { skipped } = copyDemoPhotos(source, target);
    expect(skipped.sort()).toEqual(["IMG_5072.HEIC", "SHOTLIST.md", path.join("clean-ps5", "notes.txt")].sort());
    expect(readdirSync(target).sort()).toEqual(["clean-ps5", "empty-box", "fake-slab", "reference"]);
    expect(existsSync(path.join(target, "IMG_5072.HEIC"))).toBe(false);
    expect(existsSync(path.join(target, "SHOTLIST.md"))).toBe(false);
  });

  it("says nothing was there rather than failing when the photos are missing", () => {
    expect(copyDemoPhotos(path.join(root, "nothing"), target)).toEqual({ copied: [], skipped: [], folders: [] });
  });

  it("knows a web image from a source file", () => {
    for (const name of ["a.jpg", "a.JPEG", "a.png", "a.webp", "a.avif", "a.gif", "a.svg"]) expect(WEB_IMAGE.test(name)).toBe(true);
    for (const name of ["a.heic", "a.HEIC", "a.md", "a.txt", "a.mov", "a"]) expect(WEB_IMAGE.test(name)).toBe(false);
  });
});
