import { describe, expect, it } from "vitest";
import { clearReviewMarker, markReviewStarted, REVIEW_MARKER_TTL_MS, reviewMarkerLeft, type MarkerStorage } from "./review-marker";

function memoryStorage(): MarkerStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe("review marker", () => {
  it("counts down from the moment the review was asked for", () => {
    const s = memoryStorage();
    markReviewStarted(s, "d1", 1000);
    expect(reviewMarkerLeft(s, "d1", 1000)).toBe(REVIEW_MARKER_TTL_MS);
    expect(reviewMarkerLeft(s, "d1", 1000 + REVIEW_MARKER_TTL_MS - 5)).toBe(5);
  });

  it("runs out, so a review that failed cannot lock the button for good", () => {
    const s = memoryStorage();
    markReviewStarted(s, "d1", 0);
    expect(reviewMarkerLeft(s, "d1", REVIEW_MARKER_TTL_MS + 1)).toBe(0);
  });

  it("is per deal and can be cleared", () => {
    const s = memoryStorage();
    markReviewStarted(s, "d1", 0);
    expect(reviewMarkerLeft(s, "d2", 1)).toBe(0);
    clearReviewMarker(s, "d1");
    expect(reviewMarkerLeft(s, "d1", 1)).toBe(0);
  });

  it("works with no storage and with storage that throws", () => {
    expect(reviewMarkerLeft(null, "d1", 0)).toBe(0);
    markReviewStarted(null, "d1", 0);
    const broken: MarkerStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => markReviewStarted(broken, "d1", 0)).not.toThrow();
    expect(reviewMarkerLeft(broken, "d1", 0)).toBe(0);
    expect(() => clearReviewMarker(broken, "d1")).not.toThrow();
  });
});
