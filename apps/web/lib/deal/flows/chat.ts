/** A person posts to the shared chat. */
import type { Message } from "@pay-pals/contracts";
import type { Role } from "../../role";
import type { Services } from "../../services";
import { mustDeal, say } from "./shared";

export async function postChat(services: Services, dealId: string, by: Role, text: string): Promise<Message> {
  await mustDeal(services, dealId);
  return say(services, dealId, "deal", by, text);
}
