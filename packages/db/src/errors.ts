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
