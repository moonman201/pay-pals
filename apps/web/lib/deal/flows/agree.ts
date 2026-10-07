/**
 * Two-sided agreement (PLAN.md Decision 5). Each side agrees to the current
 * card version. When the second agreement lands in REVIEWED, the card locks
 * and the deal moves to AGREED. The buyer's override rules apply only to the
 * buyer's agree. A new card version clears both agreements (the store does
 * that), so each side agrees again.
 */
import type { Deal } from "@pay-pals/contracts";
import { otherRole, type Role } from "../../role";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { BLOCKED_SENTENCE, gateFor, type Gate } from "../override";
import { expectState, mustCurrentCard, mustDeal, note, say } from "./shared";

function partyName(deal: Deal, role: Role): string {
  return role === "buyer" ? (deal.buyer?.displayName ?? "The buyer") : deal.seller.displayName;
}

async function buyerGate(services: Services, dealId: string, override: boolean): Promise<Gate> {
  const verdicts = await services.store.listVerdicts(dealId);
  const gate = gateFor(verdicts[verdicts.length - 1] ?? null);
  if (gate === "blocked") throw new FlowError(BLOCKED_SENTENCE, 403);
  if ((gate === "override" || gate === "stop_override") && !override) {
    throw new FlowError("Your pal raised flags. Say you have read them before continuing.", 409);
  }
  return gate;
}

export async function agree(services: Services, dealId: string, role: Role, override: boolean): Promise<Deal> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "REVIEWED");
  if (role === "buyer" && !deal.buyer) throw new FlowError("No buyer has joined this deal yet.", 409);
  const alreadyMine = role === "buyer" ? deal.buyerAgreedAt : deal.sellerAgreedAt;
  if (alreadyMine) return deal;

  const gate = role === "buyer" ? await buyerGate(services, dealId, override) : "open";
  const card = await mustCurrentCard(services, dealId);
  const me = partyName(deal, role);
  const other = otherRole(role);
  const acknowledged = gate === "override" || gate === "stop_override";

  // The store appends the "agreed" event itself (actor = role, data.cardVersion).
  const updated = await services.store.recordAgreement(dealId, role);
  await say(
    services,
    dealId,
    "deal",
    role,
    `I agree to card version ${card.version} at $${card.askingPrice}.${acknowledged ? " I read my pal's warning and chose to continue." : ""}`,
  );

  const both = updated.buyerAgreedAt !== null && updated.sellerAgreedAt !== null;
  if (!both || updated.state !== "REVIEWED") {
    await say(services, dealId, role === "buyer" ? "buyer_pal" : "seller_pal", role === "buyer" ? "buyer_pal" : "seller_pal", `You agreed to card version ${card.version}. Waiting for the ${other} to agree. Nothing locks until both sides have.`);
    await say(services, dealId, other === "buyer" ? "buyer_pal" : "seller_pal", other === "buyer" ? "buyer_pal" : "seller_pal", `${me} agreed to card version ${card.version}. Agree when you are ready and the card locks.`);
    return updated;
  }

  await services.store.lockCard(dealId, card.version);
  await note(services, dealId, "card_locked", "system", `Both sides agreed. Card version ${card.version} is locked.`);
  const locked = await services.store.transition(dealId, "AGREED", role, "Agreed.");
  await say(services, dealId, "buyer_pal", "buyer_pal", `Both sides agreed. Card version ${card.version} is locked. The PayPal order will carry its title, serial and condition. Pay with PayPal or Venmo when ready.`);
  await say(services, dealId, "seller_pal", "seller_pal", `Both sides agreed. Card version ${card.version} is locked and nothing on it can change now. Wait for the payment.`);
  return locked;
}
