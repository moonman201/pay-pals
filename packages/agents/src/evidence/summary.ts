/**
 * The plain-language summary at the top of an evidence pack, written for a
 * PayPal dispute reviewer. A deterministic version is always built from the
 * facts; Claude rewrites it into readable prose when a client is available.
 * Either way it comes out as short paragraphs, in a fixed order, with no
 * markdown and no heading.
 */
import type { EvidenceInput } from "@pay-pals/contracts";
import { CONDITION_LABELS, historyMatchesHead } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import { callText } from "../claude/text-call";
import { paragraphs, plainCopy } from "../copy";
import { PUBLIC_MODE_INSTRUCTION } from "../presentation";
import { unansweredQuestions } from "./unanswered";

const MAX_SUMMARY_LENGTH = 4000;

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "unknown date";
}

export function deterministicSummary(input: EvidenceInput): string {
  const { deal, lockedCard: card, verdicts, arrivalCheck, payment, shipment, messages, timeline } = input;
  const buyer = deal.buyer?.displayName ?? "the buyer";

  const dealPart = `Deal ${deal.id}, started ${day(deal.createdAt)}, between seller ${deal.seller.displayName} (${deal.seller.email}) and buyer ${buyer}. Current state: ${deal.state}. This pack was requested by the ${input.requestedBy}.`;

  const cardPart = `Locked item card, version ${card.version}${card.lockedAt ? `, locked ${day(card.lockedAt)}` : ""}: ${card.title}, brand ${card.brand}, model ${card.model}, serial ${card.serial ?? "none recorded"}${card.boxSerial ? `, box label serial ${card.boxSerial}` : ""}, condition ${CONDITION_LABELS[card.conditionGrade]}. Included: ${card.included.join(", ") || "not listed"}. Price $${card.askingPrice.toFixed(2)} USD to PayPal account ${card.sellerPaypalEmail}. Condition notes: ${card.conditionNotes || "none"}.`;
  const certPart = card.certNumber ? `The card carries grading cert ${card.certNumber}${card.grade ? `, grade ${card.grade}` : ""}.` : null;

  const review: Array<string | null> = [];
  if (verdicts.length > 0) {
    const lines = verdicts.map((v) => `card version ${v.cardVersion}: ${v.overall}${v.flags.length > 0 ? ` (${v.flags.map((f) => `${f.code} ${f.severity}`).join(", ")})` : " with no flags"}`);
    review.push(`Buyer Pal reviews before payment: ${lines.join("; ")}.`);
    const cert = [...verdicts].reverse().find((v) => v.certCheck)?.certCheck;
    if (cert) review.push(`Grading cert check: ${cert.explanation}`);
  }
  for (const question of unansweredQuestions(input)) {
    review.push(`The Buyer Pal asked the seller before payment: "${question}" The seller never answered.`);
  }

  const paymentPart = payment
    ? `Payment: PayPal order ${payment.paypalOrderId}, status ${payment.status}, $${payment.amount.toFixed(2)} ${payment.currency} to ${payment.payeeEmail}${payment.method ? ` via ${payment.method}` : ""}${payment.captureId ? `, capture ${payment.captureId}` : ""}${payment.capturedAt ? `, captured ${day(payment.capturedAt)}` : ""}.`
    : "Payment: no PayPal order was created.";

  const shipping: Array<string | null> = [];
  if (shipment) {
    const missing = shipment.checklist.filter((c) => c.required && !c.done).map((c) => c.label);
    shipping.push(
      `Shipping: ${shipment.carrier} tracking ${shipment.trackingNumber}, shipped ${day(shipment.shippedAt)}${shipment.deliveredAt ? `, delivered ${day(shipment.deliveredAt)}` : ", not yet delivered"}. ${shipment.packingPhotos.length} packing photo${shipment.packingPhotos.length === 1 ? "" : "s"} on file${missing.length > 0 ? `. Checklist steps not completed: ${missing.join("; ")}` : ""}.`,
    );
    for (const flag of shipment.flags ?? []) shipping.push(`At ship time the Buyer Pal raised ${flag.code} (${flag.severity}): ${flag.explanation}`);
  } else {
    shipping.push("Shipping: nothing was shipped.");
  }

  const arrival: Array<string | null> = [];
  if (arrivalCheck) {
    if (arrivalCheck.matches) {
      arrival.push(`Arrival check: the item matched the locked card${arrivalCheck.observed.serial ? `, serial ${arrivalCheck.observed.serial} confirmed` : ""}.`);
    } else {
      const details = arrivalCheck.mismatches.map((m) => `${m.field}: card says ${m.expected}, arrival shows ${m.observed}`).join("; ");
      arrival.push(`Arrival check on ${day(arrivalCheck.createdAt)}: the item did not match the locked card. ${details}.`);
    }
  }
  const arrivalPhotos = input.arrivalPhotos ?? [];
  if (arrivalPhotos.length > 0) {
    arrival.push(`${arrivalPhotos.length} arrival photo${arrivalPhotos.length === 1 ? "" : "s"} taken by the buyer: ${arrivalPhotos.map((p) => p.whatItShows).join("; ")}.`);
  }

  const history: Array<string | null> = [];
  const head = payment?.historyHash ?? null;
  if (head) {
    const verified = historyMatchesHead(timeline, head);
    history.push(
      `Tamper check: the deal history hash recorded on the PayPal order at payment time is ${head}. The ${timeline.length} stored timeline events ${verified ? "reproduce that hash, so the history was not edited after payment" : "do not reproduce that hash, so the stored history differs from what PayPal holds"}.`,
    );
  }
  const counts = messageCounts(messages);
  history.push(
    `${counts.shared} shared chat message${counts.shared === 1 ? "" : "s"}, ${counts.pal} pal message${counts.pal === 1 ? "" : "s"} and ${timeline.length} timeline event${timeline.length === 1 ? "" : "s"} are attached in full.`,
  );

  return paragraphs([[dealPart], [cardPart, certPart], review, [paymentPart], shipping, arrival, history], MAX_SUMMARY_LENGTH);
}

/** Messages on the shared deal channel versus the two private pal channels. */
export function messageCounts(messages: EvidenceInput["messages"]): { shared: number; pal: number } {
  const shared = messages.filter((m) => m.channel === "deal").length;
  return { shared, pal: messages.length - shared };
}

/** The chain head on the payment and whether the stored events reproduce it. Both undefined when no payment carries a hash. */
export function historyStatus(input: EvidenceInput): { historyHash: string; historyVerified: boolean } | null {
  const head = input.payment?.historyHash ?? null;
  return head ? { historyHash: head, historyVerified: historyMatchesHead(input.timeline, head) } : null;
}

const HEADING_LINE = /^(?:summary|evidence summary|evidence pack summary|dispute summary|overview)$/;

/** Drops a leading title line such as "Summary" that a model adds even when asked not to. */
export function dropHeadingLine(text: string): string {
  const lines = text.split("\n");
  const first = (lines[0] ?? "").trim().replace(/[:.]$/, "").toLowerCase();
  if (lines.length > 1 && HEADING_LINE.test(first)) return lines.slice(1).join("\n").trimStart();
  return text;
}

const SYSTEM = [
  "You write the summary at the top of an evidence pack for a PayPal dispute reviewer.",
  "State what was agreed, what was paid, what was shipped and what arrived, in that order, using only the facts given. Keep every identifier (serials, order ids, tracking numbers) exactly as written.",
  "Write short paragraphs separated by a blank line, two or three sentences each, in this order: the deal and the item card; the Buyer Pal's review and anything the seller never answered; the payment; the shipping; what arrived; the history check. Leave out a paragraph when there is nothing to say for it.",
  "No title, no heading, no markdown of any kind: no stars, no hashes, no backticks, no bullet or numbered lists. Plain sentences only.",
  "Plain words, short sentences, no em dashes, no exclamation marks, no opinion about who is at fault. Never write the words verified or authentic: say what a check showed and what it did not show.",
].join("\n");

export async function writeSummary(input: EvidenceInput, client: ClaudeClient | null, publicMode = false): Promise<string> {
  const facts = deterministicSummary(input);
  if (!client) return facts;
  const publicNote = publicMode ? ` ${PUBLIC_MODE_INSTRUCTION}` : "";
  const arrivalNote = (input.arrivalPhotos ?? []).length > 0 ? " Mention that the buyer's arrival photos are attached and what they show." : "";
  const unanswered = unansweredQuestions(input);
  const gapsNote =
    unanswered.length > 0 || (input.shipment?.flags ?? []).length > 0
      ? " State plainly any question the Buyer Pal asked the seller before payment that never got an answer, and any required packing photo the seller shipped without."
      : "";
  const text = await callText(client, SYSTEM, `Facts, in order:\n${facts}\n\nWrite the summary.${arrivalNote}${gapsNote}${publicNote}`);
  return text ? dropHeadingLine(plainCopy(text, MAX_SUMMARY_LENGTH)) : facts;
}
