import { describe, expect, it } from "vitest";
import jpeg from "jpeg-js";
import { asFetched, pictureA, pictureANearDuplicate, pictureC } from "../testing/images";
import { NEAR_DUPLICATE_DISTANCE, hammingDistance, imageHash } from "./phash";

describe("imageHash", () => {
  it("gives the same picture a near identical hash when re-saved brighter and larger", () => {
    const a = imageHash(pictureA(), "image/png")!;
    const b = imageHash(pictureANearDuplicate(), "image/png")!;
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(NEAR_DUPLICATE_DISTANCE);
  });
  it("tells a different picture apart", () => {
    const a = imageHash(pictureA(), "image/png")!;
    const c = imageHash(pictureC(), "image/png")!;
    expect(hammingDistance(a, c)).toBeGreaterThan(NEAR_DUPLICATE_DISTANCE);
  });
  it("hashes a JPEG of the same picture close to the PNG", () => {
    const png = pictureA();
    const { PNG } = require("pngjs") as typeof import("pngjs");
    const decoded = PNG.sync.read(png);
    const encoded = jpeg.encode({ width: decoded.width, height: decoded.height, data: decoded.data }, 90).data;
    const a = imageHash(png, "image/png")!;
    const j = imageHash(Buffer.from(encoded), "image/jpeg")!;
    expect(hammingDistance(a, j)).toBeLessThanOrEqual(NEAR_DUPLICATE_DISTANCE);
  });
  it("returns null for a format it cannot decode or a broken file", () => {
    expect(imageHash(Buffer.from("not an image"), "image/png")).toBeNull();
    expect(imageHash(pictureA(), "image/gif")).toBeNull();
  });
  it("round trips through the fetched image shape", () => {
    const fetched = asFetched(pictureA());
    expect(imageHash(Buffer.from(fetched.data, "base64"), fetched.mediaType)).toBe(imageHash(pictureA(), "image/png"));
  });
});
