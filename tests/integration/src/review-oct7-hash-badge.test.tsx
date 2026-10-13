/**
 * Live site review, Oct 7, PLAN item 14: the hash badge must never read
 * verified when the chain was edited. Three levels: the contract function,
 * the evidence pack builder, and the evidence page component rendered with
 * a tampered pack whose stored flag lies.
 *
 * The last case is red until PLAN item 10 lands (builder-web: the badge is
 * computed live on render from the timeline and the hash, not read from a
 * stored flag).
 *
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanPs5, historyMatchesHead, verifyChain } from "@pay-pals/contracts";
import type { DealEvent, EvidenceInput, EvidencePack } from "@pay-pals/contracts";
import { buildEvidencePack, createBuyerPal, createFixturePriceLookup } from "@pay-pals/agents";
import { EvidencePackView } from "@/components/evidence/EvidencePackView";
import { driveTo, seedFixture } from "./seed";

const VERIFIED = /Verified: the stored events reproduce this hash\./;
const WARNING = /Does not verify|do not reproduce|History (?:changed|edited)|does not match the PayPal order/i;

const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });

interface Built {
  input: EvidenceInput;
  pack: EvidencePack;
  head: string;
}

/** A clean deal driven through the store to COMPLETE, with the chain head on the payment, and its evidence pack. */
async function builtPack(): Promise<Built> {
  const seeded = await seedFixture(cleanPs5);
  const { store, dealId } = seeded;
  await driveTo(seeded, "AGREED");
  const card = (await store.getCurrentCard(dealId))!;
  const locked = await store.lockCard(dealId, card.version);
  await store.appendEvent({ dealId, kind: "card_locked", actor: "system", summary: `Both sides agreed. Card version ${card.version} is locked.`, at: new Date().toISOString() });
  const head = verifyChain(await store.listEvents(dealId)).head!;
  // A real-looking order id: a FIXTURE- id marks a seeded example deal, which the page labels instead of verifying (J6).
  await store.savePayment({ ...seeded.payment!, paypalOrderId: "5O190127TN364715T", captureId: "3C679366HH908993F", status: "CAPTURED", historyHash: head });
  await store.appendEvent({ dealId, kind: "payment_created", actor: "paypal", summary: "PayPal checkout order created.", at: new Date().toISOString() });
  for (const next of ["PAYMENT_PENDING", "PAID", "SHIPPED", "DELIVERED", "COMPLETE"] as const) await store.transition(dealId, next, "system", `${next}.`);
  await store.saveShipment(seeded.shipment!);
  const verdict = (await buyerPal.review(locked, await store.listMessages(dealId, "deal"), { seller: cleanPs5.seller })).data;

  const input: EvidenceInput = {
    deal: (await store.getDeal(dealId))!,
    lockedCard: locked,
    verdicts: [verdict],
    arrivalCheck: null,
    messages: await store.listMessages(dealId),
    payment: await store.getPayment(dealId),
    shipment: await store.getShipment(dealId),
    timeline: await store.listEvents(dealId),
    arrivalPhotos: [],
    requestedBy: "buyer",
  };
  const { data: pack } = await buildEvidencePack(input, { anthropic: null });
  return { input, pack, head };
}

/** The same events with one summary changed on an event before the recorded head. */
function tamper(timeline: DealEvent[], head: string): DealEvent[] {
  const headAt = timeline.findIndex((e) => e.hash === head);
  const at = timeline.findIndex((e, i) => i < headAt && e.kind === "state_changed");
  expect(at).toBeGreaterThanOrEqual(0);
  return timeline.map((e, i) => (i === at ? { ...e, summary: "Edited after the fact." } : e));
}

afterEach(() => cleanup());

describe("hash badge: contracts", () => {
  it("historyMatchesHead is true on the stored events and false on an edited copy", async () => {
    const { input, head } = await builtPack();
    expect(historyMatchesHead(input.timeline, head)).toBe(true);
    const edited = tamper(input.timeline, head);
    expect(historyMatchesHead(edited, head)).toBe(false);
    expect(verifyChain(edited).ok).toBe(false);
  });
});

describe("hash badge: evidence pack builder", () => {
  /**
   * Corrected 2026-10-10. This case used to require the words "matches the
   * stored events", from the sentence "The deal history hash recorded on the
   * PayPal order matches the stored events, so this is the official record of
   * the deal that PayPal can check first." The sentence was an overclaim:
   * nothing in the pack had read PayPal's copy of the hash, and on a seeded
   * example deal there is no PayPal order holding one. builder-agents removed
   * it (326ad36). The test was wrong, not the code, and it could never have
   * caught the overclaim because the two were written together. What the pack
   * can say, and what is asserted now, is that our own stored events
   * reproduce the hash we recorded with the payment.
   */
  it("says the stored events reproduce the recorded hash, and says the opposite on an edited copy", async () => {
    const { input, pack, head } = await builtPack();
    expect(pack.historyHash).toBe(head);
    expect(pack.historyVerified).toBe(true);
    const { palMessage: cleanMessage } = await buildEvidencePack(input, { anthropic: null });
    expect(`${pack.summary} ${cleanMessage}`).toContain("reproduce the hash recorded with this payment");
    // The claim that came out: PayPal's own copy was never read, so the pack may not invoke it.
    expect(`${pack.summary} ${cleanMessage}`).not.toMatch(/matches the stored events|PayPal can check first/);

    const { data: edited, palMessage: editedMessage } = await buildEvidencePack({ ...input, timeline: tamper(input.timeline, head) }, { anthropic: null });
    expect(edited.historyHash).toBe(head);
    expect(edited.historyVerified).toBe(false);
    // Not a vacuous negative: the phrase this asserts against is the one a verified pack really does carry.
    expect(`${edited.summary} ${editedMessage}`).not.toMatch(/\bare hash-chained and reproduce the hash recorded with this payment/);
    expect(`${edited.summary} ${editedMessage}`).toMatch(/do not reproduce/);
  });
});

describe("hash badge: evidence page", () => {
  it("reads verified for an untouched pack", async () => {
    const { input, pack } = await builtPack();
    render(<EvidencePackView pack={pack} deal={input.deal} role="buyer" />);
    expect(screen.getByRole("heading", { name: "Tamper-evident history" })).toBeTruthy();
    expect(screen.getByText(VERIFIED)).toBeTruthy();
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("warns, and never reads verified, for a pack built from an edited timeline", async () => {
    const { input, head } = await builtPack();
    const { data: edited } = await buildEvidencePack({ ...input, timeline: tamper(input.timeline, head) }, { anthropic: null });
    render(<EvidencePackView pack={edited} deal={input.deal} role="buyer" />);
    expect(screen.queryByText(VERIFIED)).toBeNull();
    // The badge and the summary may both say so; at least one element must.
    expect(screen.getAllByText(WARNING).length).toBeGreaterThan(0);
  });

  it("labels a seeded example deal (FIXTURE- order id) instead of verifying or warning (J6)", async () => {
    const { input, pack } = await builtPack();
    const example: EvidencePack = {
      ...pack,
      payment: { ...pack.payment!, paypalOrderId: "FIXTURE-ORDER-CLEAN-0001", captureId: "FIXTURE-CAPTURE-CLEAN-0001" },
    };
    render(<EvidencePackView pack={example} deal={input.deal} role="buyer" />);
    expect(screen.getAllByText(/Example deal, seeded from a scenario/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Order FIXTURE-ORDER-CLEAN-0001/)).toBeTruthy();
    expect(screen.getByText(/payment ids are placeholders/)).toBeTruthy();
    expect(screen.queryByText(VERIFIED)).toBeNull();
    expect(screen.queryAllByText(WARNING)).toHaveLength(0);
    expect(screen.queryByText(/PayPal's own record holds it/)).toBeNull();
  });

  it("warns when the stored flag says verified but the timeline it shows was edited (PLAN item 10: compute live on render)", async () => {
    const { input, pack, head } = await builtPack();
    // A pack saved before the edit still carries historyVerified: true; the page must not take its word for it.
    const lying: EvidencePack = { ...pack, historyVerified: true, timeline: tamper(input.timeline, head) };
    expect(historyMatchesHead(lying.timeline, lying.historyHash!)).toBe(false);
    render(<EvidencePackView pack={lying} deal={input.deal} role="buyer" />);
    expect(screen.queryByText(VERIFIED)).toBeNull();
    expect(screen.queryAllByText(WARNING).length).toBeGreaterThan(0);
  });
});
