/**
 * The house words, enforced. Pay Pals says what was checked and against
 * what, and never more than that. These are the four claims Matt ruled out
 * on 2026-10-10, each with the wording we use instead:
 *
 *   D8  refusing Pay Pals is "a risk signal". Never the strongest sign,
 *       never the strongest warning sign, never proof of fraud.
 *   D9  a matching serial or cert "supports what the listing says". It never
 *       proves ownership or authenticity, and the words verified and
 *       authentic are never used about the item.
 *   D10 the evidence pack is "useful context for a PayPal dispute". Never a
 *       guaranteed or a likely outcome.
 *   D11 the audit chain is "the official record of the deal that PayPal can
 *       check first". Never say a refund or a dispute requires it.
 *
 * Two checks. The first runs the pals over all three fixtures with no model
 * and reads every string a human sees. The second reads the package's own
 * strings, prompts included, because a prompt that invites the overclaim is
 * the same defect one step back. A string that forbids a word is allowed to
 * contain it, which is how the prompts and the honesty guard are written.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceInput, PalReasoning, ScenarioFixture } from "@pay-pals/contracts";
import { ALL_FIXTURES } from "@pay-pals/contracts";
import { createBuyerPal } from "./buyer/buyer-pal";
import { shipmentFlags } from "./buyer/shipment";
import { createFixtureCertLookup } from "./cert/fixture-lookup";
import { buildEvidencePack } from "./evidence/build-evidence-pack";
import { createFixturePriceLookup } from "./price/fixture-lookup";
import { createSellerPal } from "./seller/seller-pal";

/** Each entry: what we must never claim, and the pattern that catches it. */
const BANNED: ReadonlyArray<readonly [string, RegExp]> = [
  ["D8 the strongest sign", /\bstrongest\b/i],
  ["D8 proof of fraud", /\bproof of (?:fraud|a scam)\b/i],
  ["D9 verified", /\bverif(?:y|ies|ied|ying|ication)\b/i],
  ["D9 authentic", /\bauthentic(?:ated|ation|ity)?\b/i],
  ["D9 proves ownership or authenticity", /\b(?:prove[sdn]?|proof) (?:of )?(?:ownership|authenticity|who owns|that the seller owns)\b/i],
  ["D10 a guaranteed outcome", /\bguaranteed\b/i],
  ["D10 a promised outcome", /\bguarantees?\s+(?:a\s+)?(?:refund|your money|the outcome|you)\b/i],
  ["D10 your money back", /\b(?:get|getting|receive) your money back\b/i],
  ["D10 a likely outcome", /\bwill\s+(?:win|be refunded|get (?:a refund|your money))\b/i],
  ["D11 a dispute that requires the pack", /\b(?:dispute|refund|claim|chargeback)s?\s+(?:requires?|needs?|depends? on)\b/i],
  ["D11 the pack as a precondition", /\b(?:required|needed)\s+(?:to open|to get|for)\s+(?:a\s+)?(?:dispute|refund|claim|chargeback)\b/i],
];

/** A sentence that forbids a word may name it. "Never write the words verified or authentic" is the point, not a breach. */
const FORBIDS = /\bnever\b|\bdo not say\b|\bnot verification\b/i;

function breaches(text: string): string[] {
  if (FORBIDS.test(text)) return [];
  return BANNED.filter(([, pattern]) => pattern.test(text)).map(([name, pattern]) => `${name}: "${text.match(pattern)![0]}" in ${JSON.stringify(text.slice(0, 160))}`);
}

function breachesIn(strings: ReadonlyArray<string | null | undefined>): string[] {
  return strings.flatMap((text) => (typeof text === "string" && text.length > 0 ? breaches(text) : []));
}

/**
 * The pal's four groups of reasons, flattened. They are sentences a human
 * reads on the deal page, so D8 to D11 bind them exactly as they bind the pal
 * message. This is also where a group that went missing would show up: the
 * contract says a group may be empty but not absent.
 */
function reasonStrings(reasoning: PalReasoning | undefined, where: string): string[] {
  expect(reasoning, `${where} has no reasoning`).toBeDefined();
  for (const group of ["checked", "found", "couldNotVerify", "wouldChangeMyMind"] as const) {
    expect(Array.isArray(reasoning![group]), `${where} is missing the ${group} group`).toBe(true);
  }
  return [...reasoning!.checked, ...reasoning!.found, ...reasoning!.couldNotVerify, ...reasoning!.wouldChangeMyMind];
}

/** Every string a human reads out of one scenario: pal messages, flag explanations, questions, the reasons, the evidence summary. */
async function scenarioStrings(fixture: ScenarioFixture): Promise<string[]> {
  const buyerPal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup(), certLookup: createFixtureCertLookup() });
  const sellerPal = createSellerPal({ anthropic: null });
  const out: string[] = [];

  const built = await sellerPal.buildCard({
    dealId: fixture.deal.id,
    listingText: fixture.listingText,
    photos: fixture.listingPhotos,
    sellerNotes: fixture.sellerNotes,
    sellerPaypalEmail: fixture.cards[0]!.sellerPaypalEmail,
  });
  out.push(built.palMessage);

  const context = { dealId: fixture.deal.id, seller: fixture.seller, sellerJoined: true };
  for (const card of fixture.cards) {
    const { data: verdict, palMessage } = await buyerPal.review(card, fixture.chat, context);
    out.push(palMessage, verdict.palMessage, ...verdict.questionsForSeller, verdict.certCheck?.explanation ?? null as never);
    out.push(...reasonStrings(verdict.reasoning, `${fixture.id} review of card v${card.version}`));
    for (const flag of verdict.flags) out.push(flag.explanation, flag.evidence);
  }

  const lockedCard = fixture.cards.at(-1)!;
  const checklist = await sellerPal.shipmentChecklist(fixture.deal, lockedCard);
  out.push(checklist.palMessage, ...checklist.data.map((item) => item.label));
  if (fixture.shipment) for (const flag of shipmentFlags(fixture.shipment)) out.push(flag.explanation, flag.evidence);

  const arrival = await buyerPal.checkArrival(lockedCard, fixture.arrivalPhotos);
  out.push(arrival.palMessage, arrival.data.palMessage, ...arrival.data.mismatches.map((m) => m.explanation));
  out.push(...reasonStrings(arrival.data.reasoning, `${fixture.id} arrival check`));

  const verdicts = [(await buyerPal.review(lockedCard, fixture.chat, context)).data];
  const input: EvidenceInput = {
    deal: fixture.deal,
    lockedCard,
    verdicts,
    arrivalCheck: arrival.data,
    messages: fixture.chat,
    payment: fixture.payment,
    shipment: fixture.shipment,
    timeline: fixture.timeline,
    arrivalPhotos: fixture.arrivalPhotos,
    requestedBy: "buyer",
  };
  const pack = await buildEvidencePack(input, { anthropic: null });
  out.push(pack.palMessage, pack.data.summary, ...(pack.data.unansweredQuestions ?? []));
  return out.filter((text): text is string => typeof text === "string");
}

const SRC = dirname(fileURLToPath(import.meta.url));

/** Every .ts file under src, tests and the honesty guard's own word list aside. */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) return [];
    return path.endsWith(join("buyer", "claim-check.ts")) ? [] : [path];
  });
}

/** The quoted strings in a source file, with the interpolated code taken out of the template literals. */
export function proseStrings(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) out.push(match[1]!);
  for (const match of source.matchAll(/`((?:[^`\\]|\\.)*)`/g)) out.push(match[1]!.replace(/\$\{[^}]*\}/g, " "));
  return out.filter((text) => /[a-z]{3}\s+[a-z]{3}/i.test(text));
}

describe("the house words", () => {
  it.each(ALL_FIXTURES.map((f) => [f.id, f] as const))("%s: nothing a human reads makes a claim we do not stand behind", async (_id, fixture) => {
    const strings = await scenarioStrings(fixture);
    expect(strings.length).toBeGreaterThan(10);
    expect(breachesIn(strings)).toEqual([]);
  });

  it("no string in the package makes one either, prompts included", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(40);
    const found = files.flatMap((file) => breachesIn(proseStrings(readFileSync(file, "utf8"))).map((breach) => `${file.slice(SRC.length + 1)}: ${breach}`));
    expect(found).toEqual([]);
  });

  it("catches the wordings it is here to catch", () => {
    expect(breaches("The seller refused, which is the strongest sign of a scam.")).toHaveLength(1);
    expect(breaches("The cert is verified and the card is authentic.")).toHaveLength(2);
    expect(breaches("Attach the pack and you will get your money back.").length).toBeGreaterThanOrEqual(1);
    expect(breaches("This pack guarantees a refund.").length).toBeGreaterThanOrEqual(1);
    expect(breaches("A refund requires the history hash.")).toHaveLength(1);
    expect(breaches("A matching cert proves ownership.")).toHaveLength(1);
    expect(breaches("The matching serial supports what the listing says.")).toEqual([]);
    expect(breaches("Never write the words verified or authentic.")).toEqual([]);
  });
});
