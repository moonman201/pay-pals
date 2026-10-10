/**
 * Contracts v1.8.0: an evidence pack says where its history hash stands against
 * PayPal's own copy, so the tamper check can only claim corroboration when it
 * has it. Before this field the pack claimed PayPal held the hash on seeded
 * example deals, where no PayPal order existed at all.
 */
import { describe, expect, it } from "vitest";
import { EvidencePackSchema, HISTORY_ANCHORS } from "./evidence";
import { fakeSlab } from "./fixtures/fake-slab";

const pack = {
  dealId: "d1",
  builtBy: "buyer",
  builtAt: "2026-10-10T12:00:00.000Z",
  lockedCard: fakeSlab.cards[0],
  verdicts: [],
  arrivalCheck: null,
  messages: [],
  photos: [],
  payment: null,
  shipment: null,
  timeline: [],
  summary: "What happened, in plain words.",
};

describe("where the history hash stands against PayPal", () => {
  it("names exactly three cases, so a fourth cannot appear without a contract change", () => {
    expect([...HISTORY_ANCHORS]).toEqual(["corroborated", "recorded_only", "not_anchored"]);
  });

  it("parses a pack built before v1.8.0, which must be read as the conservative case", () => {
    expect(EvidencePackSchema.parse(pack).historyAnchor).toBeUndefined();
  });

  for (const anchor of HISTORY_ANCHORS) {
    it(`round-trips ${anchor}`, () => {
      expect(EvidencePackSchema.parse({ ...pack, historyAnchor: anchor }).historyAnchor).toBe(anchor);
    });
  }

  it("refuses an anchor it does not know", () => {
    expect(EvidencePackSchema.safeParse({ ...pack, historyAnchor: "probably_fine" }).success).toBe(false);
  });
});
