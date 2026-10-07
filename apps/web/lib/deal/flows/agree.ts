/**
 * The buyer agrees to the card as it stands. The card version is locked and
 * becomes the text of the PayPal order. Caution flags need an explicit
 * override; a payment-method flag cannot be overridden.
 */
import type { Deal } from "@pay-pals/contracts";
import type { Services } from "../../services";
import { FlowError } from "../errors";
import { BLOCKED_SENTENCE, gateFor } from "../override";
import { expectState, mustCurrentCard, mustDeal, note, say } from "./shared";

export async function agree(services: Services, dealId: string, override: boolean): Promise<Deal> {
  const deal = await mustDeal(services, dealId);
  expectState(deal, "REVIEWED");
  const verdicts = await services.store.listVerdicts(dealId);
  const verdict = verdicts[verdicts.length - 1] ?? null;
  const gate = gateFor(verdict);
  if (gate === "blocked") throw new FlowError(BLOCKED_SENTENCE, 403);
  if (gate === "override" && !override) throw new FlowError("Your pal raised flags. Say you understand before continuing.", 409);

  const card = await mustCurrentCard(services, dealId);
  await services.store.lockCard(dealId, card.version);
  await note(services, dealId, "card_locked", "system", `Both sides agreed. Card version ${card.version} is locked.`);
  const summary = gate === "override" ? "Agreed. The buyer read the caution flags and chose to continue." : "Agreed.";
  const updated = await services.store.transition(dealId, "AGREED", "buyer", summary);
  await say(services, dealId, "deal", "buyer", `I agree to card version ${card.version} at $${card.askingPrice}.`);
  await say(services, dealId, "buyer_pal", "buyer_pal", `Card version ${card.version} is locked. The PayPal order will carry its title, serial and condition. Pay with PayPal or Venmo when ready.`);
  await say(services, dealId, "seller_pal", "seller_pal", `The buyer agreed. Card version ${card.version} is locked and nothing on it can change now. Wait for the payment.`);
  return updated;
}
