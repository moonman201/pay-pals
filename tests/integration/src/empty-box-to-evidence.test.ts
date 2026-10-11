/**
 * Scenario 3 across the modules: the empty-box deal runs through the store
 * to DELIVERED, the Buyer Pal reads the arrival photos, finds no console
 * serial, names the mismatch against the locked card, the deal moves to
 * ISSUE, and the evidence pack carries the locked card (console and box
 * serial), the arrival photos and the mismatch in its summary.
 *
 * Two readings of the same photos (review item 2): with no loadable image
 * the pal can only say the serial was not readable, still a mismatch; with a
 * real photo and vision it sees the box is empty. The vision case runs only
 * when the fixture photos exist and a Claude key is present.
 *
 * Corrected 2026-10-10 for contracts v1.8.0, which replaced
 * `ArrivalCheck.matches: boolean` with a three-value `outcome`. These cases
 * asserted `matches: false`, which the new union splits into two different
 * answers, so each one had to be re-decided rather than translated. Every one
 * of them is `mismatch`, and deliberately so: an empty box is a real
 * difference from the card, not a comparison that could not be settled. If
 * any of these ever came back `inconclusive` the scenario would have stopped
 * working, so the assertions name the outcome they expect rather than any
 * not-a-match shorthand.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMPTY_BOX_LOCKED_SERIAL, EvidencePackSchema, emptyBox } from "@pay-pals/contracts";
import type { ArrivalCheck, EvidenceInput, EvidencePack, ItemCard } from "@pay-pals/contracts";
import { buildEvidencePack, createAnthropicClientFromEnv, createBuyerPal, createFixturePriceLookup } from "@pay-pals/agents";
import { LOCAL_PHOTO_BASE, fileImageFetcher } from "./local-images";
import { driveTo, seedFixture } from "./seed";
import type { SeededDeal } from "./seed";

const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });

const PUBLIC_FIXTURES = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "apps", "web", "public");
const photoFilesPresent = emptyBox.arrivalPhotos.every((p) => existsSync(resolve(PUBLIC_FIXTURES, `.${p.url}`)));
const visionClient = process.env.SKIP_REAL_TESTS ? null : createAnthropicClientFromEnv();

interface DeliveredDeal {
  seeded: SeededDeal;
  lockedCard: ItemCard;
}

/** Review, agree and lock, pay, ship, deliver. Saves the verdict, payment and shipment along the way. */
async function deliverEmptyBox(): Promise<DeliveredDeal> {
  const seeded = await seedFixture(emptyBox);
  const { store, dealId } = seeded;

  const card = (await store.getCurrentCard(dealId))!;
  const chat = await store.listMessages(dealId, "deal");
  const { data: verdict } = await buyerPal.review(card, chat, { seller: emptyBox.seller });
  expect(verdict.overall).not.toBe("stop");
  await store.saveVerdict(verdict);

  await driveTo(seeded, "AGREED");
  const lockedCard = await store.lockCard(dealId, card.version);
  await store.transition(dealId, "PAYMENT_PENDING", "system", "Payment pending.");
  await store.savePayment(seeded.payment!);
  await store.transition(dealId, "PAID", "system", "Paid.");
  await store.saveShipment(seeded.shipment!);
  await store.transition(dealId, "SHIPPED", "seller", "Shipped.");
  await store.transition(dealId, "DELIVERED", "buyer", "Delivered.");
  expect((await store.getDeal(dealId))!.state).toBe("DELIVERED");
  return { seeded, lockedCard };
}

async function checkAndRaiseIssue(delivered: DeliveredDeal): Promise<ArrivalCheck> {
  const { seeded, lockedCard } = delivered;
  const { data: check } = await buyerPal.checkArrival(lockedCard, seeded.arrivalPhotos);
  await seeded.store.saveArrivalCheck(check);
  await seeded.store.transition(seeded.dealId, "ISSUE", "buyer_pal", "Issue opened: the box arrived empty.");
  return check;
}

async function gatherEvidence(delivered: DeliveredDeal): Promise<EvidenceInput> {
  const { seeded, lockedCard } = delivered;
  const { store, dealId } = seeded;
  return {
    deal: (await store.getDeal(dealId))!,
    lockedCard,
    verdicts: await store.listVerdicts(dealId),
    arrivalCheck: await store.getArrivalCheck(dealId),
    messages: await store.listMessages(dealId),
    payment: await store.getPayment(dealId),
    shipment: await store.getShipment(dealId),
    timeline: await store.listEvents(dealId),
    arrivalPhotos: seeded.arrivalPhotos,
    requestedBy: "buyer",
  };
}

describe("empty-box: arrival check to evidence pack", () => {
  it("finds no console serial in the photos, names the mismatch against the locked card, and the box label does not count", async () => {
    const delivered = await deliverEmptyBox();
    const check = await checkAndRaiseIssue(delivered);

    // A mismatch, not inconclusive: nothing arrived, and an absent item is a difference the pal can settle.
    expect(check.outcome).toBe("mismatch");
    expect(check.unsettled ?? [], "nothing here is unsettled").toEqual([]);
    expect(check.cardVersion).toBe(delivered.lockedCard.version);
    const fields = check.mismatches.map((m) => m.field);
    for (const field of emptyBox.expectedArrival!.mismatchFields) expect(fields).toContain(field);

    // The locked card never got a console serial, so there is nothing for an arriving serial to contradict.
    // The mismatch is the item itself: the box came with packaging and no console.
    expect(delivered.lockedCard.serial).toBeNull();
    expect(delivered.lockedCard.boxSerial).toBe(EMPTY_BOX_LOCKED_SERIAL);
    expect(check.mismatches).toHaveLength(1);
    expect(fields, "no serial row: the card has no serial to be wrong about").not.toContain("serial");

    const missing = check.mismatches.find((m) => m.field === "other")!;
    expect(missing.expected).toContain(delivered.lockedCard.model!);
    expect(missing.observed).toMatch(/nothing in the box|no console|not present/i);
    expect(missing.explanation).toContain(delivered.lockedCard.model!);
    expect(check.observed.serial).toBeNull();
    // The box label that did arrive is not the item, and the pal says so rather than counting it.
    expect(check.palMessage).toContain(EMPTY_BOX_LOCKED_SERIAL);
    expect(check.palMessage).toContain("does not count");

    const { store, dealId } = delivered.seeded;
    expect((await store.getArrivalCheck(dealId))!.outcome).toBe("mismatch");
    expect((await store.getDeal(dealId))!.state).toBe("ISSUE");
  });

  it("builds an evidence pack with the locked card, both serial fields, the arrival photos and the mismatch in the summary", async () => {
    const delivered = await deliverEmptyBox();
    const check = await checkAndRaiseIssue(delivered);
    const input = await gatherEvidence(delivered);

    const { data: pack, palMessage } = await buildEvidencePack(input, { anthropic: null });
    expect(EvidencePackSchema.safeParse(pack).success).toBe(true);
    expect(pack.dealId).toBe(delivered.seeded.dealId);
    expect(pack.builtBy).toBe("buyer_pal");

    expect(pack.lockedCard.lockedAt).not.toBeNull();
    expect(pack.lockedCard.version).toBe(delivered.lockedCard.version);
    // The seller never answered, so the card that locked still has only the box label.
    expect(pack.lockedCard.serial).toBeNull();
    expect(pack.lockedCard.boxSerial).toBe(EMPTY_BOX_LOCKED_SERIAL);

    const urls = pack.photos.map((p) => p.url);
    for (const photo of emptyBox.arrivalPhotos) expect(urls).toContain(photo.url);
    for (const photo of delivered.lockedCard.photos) expect(urls).toContain(photo.url);
    expect(new Set(urls).size).toBe(urls.length);

    const missing = check.mismatches.find((m) => m.field === "other")!;
    expect(pack.summary).toContain(EMPTY_BOX_LOCKED_SERIAL);
    expect(pack.summary).toContain(missing.observed);
    expect(pack.summary).toContain(emptyBox.payment!.paypalOrderId);
    expect(pack.summary).toContain(emptyBox.shipment!.trackingNumber);
    expect(pack.summary).toContain(emptyBox.arrivalPhotos[0]!.whatItShows);
    expect(pack.arrivalCheck?.outcome).toBe("mismatch");
    expect(pack.payment?.paypalOrderId).toBe(emptyBox.payment!.paypalOrderId);
    expect(pack.shipment?.trackingNumber).toBe(emptyBox.shipment!.trackingNumber);
    expect(pack.timeline.some((e) => e.kind === "state_changed" && e.toState === "ISSUE")).toBe(true);
    expect(palMessage).toContain("dispute");
  });

  it("stores the pack and reads it back unchanged", async () => {
    const delivered = await deliverEmptyBox();
    await checkAndRaiseIssue(delivered);
    const { data: pack } = await buildEvidencePack(await gatherEvidence(delivered), { anthropic: null });
    const { store, dealId } = delivered.seeded;

    await store.saveEvidence(pack);
    const stored: EvidencePack | null = await store.getEvidence(dealId);
    expect(stored).toEqual(pack);
  });

  // Runs once Matt's photos are under apps/web/public/fixtures and a Claude key is present (never under SKIP_REAL_TESTS).
  it.skipIf(!photoFilesPresent || !visionClient)("with the real photos, vision sees the box is empty and names it (review item 2)", async () => {
    const delivered = await deliverEmptyBox();
    // The photos keep their app-relative URLs; the fetcher answers them from public/fixtures.
    // A file:// URL would not be fetched at all and the pal would read the captions instead.
    const photos = delivered.seeded.arrivalPhotos.map((p) => ({ ...p, url: `${LOCAL_PHOTO_BASE}${p.url}` }));
    const files = Object.fromEntries(photos.map((p, i) => [p.url, resolve(PUBLIC_FIXTURES, `.${delivered.seeded.arrivalPhotos[i]!.url}`)]));
    const vision = createBuyerPal({ anthropic: visionClient, priceLookup: createFixturePriceLookup(), fetchImage: fileImageFetcher(files) });
    const { data: check } = await vision.checkArrival(delivered.lockedCard, photos);

    // Still a mismatch when the pal reads the pictures: it sees foam and a bag and no console.
    expect(check.outcome).toBe("mismatch");
    // Vision actually ran: the pal says it looked at the photos, not at their descriptions.
    expect(check.palMessage).toMatch(/I looked at/i);
    // Vision sees foam and a bag and no console. The locked card has no console serial, so the
    // mismatch is the item, not a serial: the same single "other" row the keyless path produces.
    const other = check.mismatches.find((m) => m.field === "other")!;
    expect(other).toBeDefined();
    expect(other.observed).toMatch(/nothing in the box|no console|not present|empty/i);
    expect(check.mismatches.map((m) => m.field)).not.toContain("serial");
    expect(check.palMessage).toContain("without the item");
    expect(check.palMessage).not.toMatch(/photo description/i);
    // Two real vision calls, one per arrival photo.
  }, 120_000);
});
