/**
 * Where a store gets "now". Both store factories take an optional clock and
 * use it for every timestamp they generate: event `at`, createdAt and
 * updatedAt, lockedAt, agreement times, sellerJoinedAt. The default is the
 * wall clock. A replay clock lets a seeder set the time before each
 * replayed step so a seeded timeline carries the fixture's dates.
 *
 * The hash chain orders events by (at, id), so within one deal the clock
 * must only move forward. An append that would land before the deal's
 * latest event is refused with EventOutOfOrderError.
 */

export type Clock = () => Date;

export interface StoreOptions {
  clock?: Clock;
}

export const systemClock: Clock = () => new Date();

export interface ReplayClock {
  /** Pass this as the store's clock. */
  clock: Clock;
  /** Set the time the next store calls will stamp. ISO 8601. */
  set(iso: string): void;
  /** The current replay time. */
  now(): string;
}

export function createReplayClock(startIso: string = new Date().toISOString()): ReplayClock {
  let current = new Date(startIso);
  if (Number.isNaN(current.getTime())) throw new Error(`createReplayClock: not a valid time: ${startIso}`);
  return {
    clock: () => new Date(current.getTime()),
    set(iso: string) {
      const next = new Date(iso);
      if (Number.isNaN(next.getTime())) throw new Error(`ReplayClock.set: not a valid time: ${iso}`);
      current = next;
    },
    now: () => current.toISOString(),
  };
}
