/**
 * Tamper-evident deal history. Every event carries the hash of the previous
 * event and its own hash over canonical fields, so a stored history can be
 * recomputed and compared with the head that PayPal holds on the order.
 * Pure functions, no I/O, runs in Node and the browser.
 */
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type { DealEvent } from "./messages";

/** The fields that are hashed. id, prevHash and hash are excluded on purpose. */
export type HashedEventFields = Pick<DealEvent, "dealId" | "kind" | "actor" | "summary" | "fromState" | "toState" | "data" | "at">;

/** JSON with sorted keys and no undefined values, so the same event always serializes the same way. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function hashEvent(prevHash: string | null, event: HashedEventFields): string {
  const body = canonicalJson({
    prevHash,
    dealId: event.dealId,
    kind: event.kind,
    actor: event.actor,
    summary: event.summary,
    fromState: event.fromState ?? null,
    toState: event.toState ?? null,
    data: event.data ?? null,
    at: event.at,
  });
  return bytesToHex(sha256(utf8ToBytes(body)));
}

/** Give an ordered list of events their prevHash and hash. Used by stores and fixtures. */
export function chainEvents<T extends HashedEventFields & { id: string }>(events: readonly T[]): Array<T & { prevHash: string | null; hash: string }> {
  let prev: string | null = null;
  return events.map((e) => {
    const hash = hashEvent(prev, e);
    const out = { ...e, prevHash: prev, hash };
    prev = hash;
    return out;
  });
}

export interface ChainVerification {
  ok: boolean;
  /** Head of the chain as stored, or null when there are no events. */
  head: string | null;
  /** Index of the first event whose stored hash does not match, or null. */
  brokenAt: number | null;
}

/** Recompute the chain over stored events and compare with what they carry. */
export function verifyChain(events: readonly DealEvent[]): ChainVerification {
  let prev: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.prevHash !== prev || hashEvent(prev, e) !== e.hash) return { ok: false, head: events[events.length - 1]?.hash ?? null, brokenAt: i };
    prev = e.hash;
  }
  return { ok: true, head: prev, brokenAt: null };
}

/** True when the stored events reproduce the head that PayPal holds, up to and including that head. */
export function historyMatchesHead(events: readonly DealEvent[], head: string): boolean {
  const upTo = events.findIndex((e) => e.hash === head);
  if (upTo === -1) return false;
  return verifyChain(events.slice(0, upTo + 1)).ok;
}
