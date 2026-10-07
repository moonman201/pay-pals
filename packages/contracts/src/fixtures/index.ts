import type { ScenarioId } from "../deal";
import { scamGarmin } from "./scam-garmin";
import { cleanGarmin } from "./clean-garmin";
import { wrongItem } from "./wrong-item";
import type { ScenarioFixture } from "./types";

export type { ScenarioFixture, ExpectedVerdict, ExpectedArrival } from "./types";
export { scamGarmin, cleanGarmin, wrongItem };
export { CLEAN_SERIAL } from "./clean-garmin";
export { WRONG_ITEM_LOCKED_SERIAL, WRONG_ITEM_ARRIVED_SERIAL } from "./wrong-item";

export const FIXTURES: Readonly<Record<ScenarioId, ScenarioFixture>> = {
  "scam-garmin": scamGarmin,
  "clean-garmin": cleanGarmin,
  "wrong-item": wrongItem,
};

export const ALL_FIXTURES: readonly ScenarioFixture[] = [scamGarmin, cleanGarmin, wrongItem];

export function getFixture(id: ScenarioId): ScenarioFixture {
  return FIXTURES[id];
}
