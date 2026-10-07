/**
 * The plain-language summary at the top of an evidence pack, written for a
 * PayPal dispute reviewer. A deterministic version is always built from the
 * facts; Claude rewrites it into readable prose when a client is available.
 */
import type { EvidenceInput } from "@pay-pals/contracts";
import { CONDITION_LABELS } from "@pay-pals/contracts";
import type { ClaudeClient } from "../claude/client";
import { callText } from "../claude/text-call";
import { plainCopy } from "../copy";

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "unknown date";
}

export function deterministicSummary(input: EvidenceInput): string {
  const { deal, lockedCard: card, verdicts, arrivalCheck, payment, shipment, messages, timeline } = input;
  const buyer = deal.buyer?.displayName ?? "the buyer";
  const parts: string[] = [];

  parts.push(
    `Deal ${deal.id}, started ${day(deal.createdAt)}, between seller ${deal.seller.displayName} (${deal.seller.email}) and buyer ${buyer}. Current state: ${deal.state}. This pack was requested by the ${input.requestedBy}.`,
  );
  parts.push(
    `Locked item card, version ${card.version}${card.lockedAt ? `, locked ${day(card.lockedAt)}` : ""}: ${card.title}, brand ${card.brand}, model ${card.model}, serial ${card.serial ?? "none recorded"}, condition ${CONDITION_LABELS[card.conditionGrade]}. Included: ${card.included.join(", ") || "not listed"}. Price $${card.askingPrice.toFixed(2)} USD to PayPal account ${card.sellerPaypalEmail}. Condition notes: ${card.conditionNotes || "none"}.`,
  );
  if (verdicts.length > 0) {
    const lines = verdicts.map((v) => `card version ${v.cardVersion}: ${v.overall}${v.flags.length > 0 ? ` (${v.flags.map((f) => `${f.code} ${f.severity}`).join(", ")})` : " with no flags"}`);
    parts.push(`Buyer Pal reviews before payment: ${lines.join("; ")}.`);
  }
  if (payment) {
    parts.push(
      `Payment: PayPal order ${payment.paypalOrderId}, status ${payment.status}, $${payment.amount.toFixed(2)} ${payment.currency} to ${payment.payeeEmail}${payment.method ? ` via ${payment.method}` : ""}${payment.captureId ? `, capture ${payment.captureId}` : ""}${payment.capturedAt ? `, captured ${day(payment.capturedAt)}` : ""}.`,
    );
  } else {
    parts.push("Payment: no PayPal order was created.");
  }
  if (shipment) {
    const missing = shipment.checklist.filter((c) => c.required && !c.done).map((c) => c.label);
    parts.push(
      `Shipping: ${shipment.carrier} tracking ${shipment.trackingNumber}, shipped ${day(shipment.shippedAt)}${shipment.deliveredAt ? `, delivered ${day(shipment.deliveredAt)}` : ", not yet delivered"}. ${shipment.packingPhotos.length} packing photo${shipment.packingPhotos.length === 1 ? "" : "s"} on file${missing.length > 0 ? `. Checklist steps not completed: ${missing.join("; ")}` : ""}.`,
    );
  } else {
    parts.push("Shipping: nothing was shipped.");
  }
  if (arrivalCheck) {
    if (arrivalCheck.matches) {
      parts.push(`Arrival check: the item matched the locked card${arrivalCheck.observed.serial ? `, serial ${arrivalCheck.observed.serial} confirmed` : ""}.`);
    } else {
      const details = arrivalCheck.mismatches.map((m) => `${m.field}: card says ${m.expected}, arrival shows ${m.observed}`).join("; ");
      parts.push(`Arrival check on ${day(arrivalCheck.createdAt)}: the item did not match the locked card. ${details}.`);
    }
  }
  const arrivalPhotos = input.arrivalPhotos ?? [];
  if (arrivalPhotos.length > 0) {
    parts.push(
      `${arrivalPhotos.length} arrival photo${arrivalPhotos.length === 1 ? "" : "s"} taken by the buyer: ${arrivalPhotos.map((p) => p.whatItShows).join("; ")}.`,
    );
  }
  parts.push(`${messages.length} chat message${messages.length === 1 ? "" : "s"} and ${timeline.length} timeline event${timeline.length === 1 ? "" : "s"} are attached in full.`);
  return plainCopy(parts.join(" "), 4000);
}

const SYSTEM = [
  "You write the summary at the top of an evidence pack for a PayPal dispute reviewer.",
  "State what was agreed, what was paid, what was shipped and what arrived, in that order, using only the facts given. Keep every identifier (serials, order ids, tracking numbers) exactly as written.",
  "Plain words, short sentences, no em dashes, no exclamation marks, no opinion about who is at fault. Four to eight sentences.",
].join("\n");

export async function writeSummary(input: EvidenceInput, client: ClaudeClient | null): Promise<string> {
  const facts = deterministicSummary(input);
  if (!client) return facts;
  const arrivalNote = (input.arrivalPhotos ?? []).length > 0 ? " Mention that the buyer's arrival photos are attached and what they show." : "";
  const text = await callText(client, SYSTEM, `Facts, in order:\n${facts}\n\nWrite the summary.${arrivalNote}`);
  return text ? plainCopy(text, 4000) : facts;
}
