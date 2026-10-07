/**
 * The one place an event gets its place in the deal's hash chain. Both
 * stores call chainNext with the hash of the deal's latest event (by at,
 * then id) and the event's fields; it returns prevHash and hash computed
 * with hashEvent from contracts. Callers never pass hashes.
 */
import { hashEvent } from "@pay-pals/contracts";
import type { DealEvent } from "@pay-pals/contracts";

/** What callers hand to appendEvent: no id, no hashes. */
export type NewEvent = Omit<DealEvent, "id" | "prevHash" | "hash">;

export interface ChainLink {
  prevHash: string | null;
  hash: string;
}

export function chainNext(prevHash: string | null, event: NewEvent): ChainLink {
  return { prevHash, hash: hashEvent(prevHash, event) };
}
