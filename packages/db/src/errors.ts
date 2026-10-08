/**
 * Errors the store throws besides IllegalTransitionError (which comes from contracts).
 * apps/web maps these to HTTP responses.
 */

export class DealNotFoundError extends Error {
  constructor(public readonly dealId: string) {
    super(`Deal not found: ${dealId}`);
    this.name = "DealNotFoundError";
  }
}

/** The deal is in a state where the card may not change or be locked (anything past REVIEWED, or a side exit). */
export class CardNotEditableError extends Error {
  constructor(
    public readonly dealId: string,
    public readonly state: string,
    public readonly action: "save" | "lock",
  ) {
    super(`Cannot ${action} the card for deal ${dealId} while it is ${state}`);
    this.name = "CardNotEditableError";
  }
}

/** The seller tried to join a deal that has not been opened to them (DRAFT) or is already over. */
export class SellerJoinNotAllowedError extends Error {
  constructor(
    public readonly dealId: string,
    public readonly state: string,
  ) {
    super(`The seller cannot join deal ${dealId} while it is ${state}`);
    this.name = "SellerJoinNotAllowedError";
  }
}

/** An append would land before the deal's latest event. The chain orders by (at, id), so time only moves forward within a deal. */
export class EventOutOfOrderError extends Error {
  constructor(
    public readonly dealId: string,
    public readonly at: string,
    public readonly latestAt: string,
  ) {
    super(`Event for deal ${dealId} at ${at} is earlier than the deal's latest event at ${latestAt}; the clock must only move forward within a deal`);
    this.name = "EventOutOfOrderError";
  }
}

/** A stored event has no hash yet. Run the backfill (npm run db:backfill-hashes -w packages/db). */
export class EventNotHashedError extends Error {
  constructor(public readonly eventId: string) {
    super(`Event ${eventId} has no hash. Run: npm run db:backfill-hashes -w packages/db`);
    this.name = "EventNotHashedError";
  }
}

/** A side tried to agree while the deal was not LISTED or REVIEWED. */
export class AgreementNotAllowedError extends Error {
  constructor(
    public readonly dealId: string,
    public readonly state: string,
  ) {
    super(`Cannot record agreement for deal ${dealId} while it is ${state}`);
    this.name = "AgreementNotAllowedError";
  }
}

export class CardLockedError extends Error {
  constructor(
    public readonly dealId: string,
    public readonly lockedVersion: number,
  ) {
    super(`Card for deal ${dealId} is locked at version ${lockedVersion} and cannot change`);
    this.name = "CardLockedError";
  }
}

export class CardVersionError extends Error {
  constructor(
    public readonly dealId: string,
    public readonly expected: number,
    public readonly got: number,
  ) {
    super(`Card version for deal ${dealId} must be ${expected}, got ${got}`);
    this.name = "CardVersionError";
  }
}

export class CardNotFoundError extends Error {
  constructor(
    public readonly dealId: string,
    public readonly version: number,
  ) {
    super(`Card version ${version} not found for deal ${dealId}`);
    this.name = "CardNotFoundError";
  }
}
