import type { ScenarioId } from "../deal";
import { scamPs5 } from "./scam-ps5";
import { cleanPs5 } from "./clean-ps5";
import { emptyBox } from "./empty-box";
import type { ScenarioFixture } from "./types";

export type { ScenarioFixture, ExpectedVerdict, ExpectedArrival } from "./types";
export { scamPs5, cleanPs5, emptyBox };
export { CLEAN_SERIAL } from "./clean-ps5";
export { EMPTY_BOX_LOCKED_SERIAL } from "./empty-box";

export const FIXTURES: Readonly<Record<ScenarioId, ScenarioFixture>> = {
  "scam-ps5": scamPs5,
  "clean-ps5": cleanPs5,
  "empty-box": emptyBox,
};

export const ALL_FIXTURES: readonly ScenarioFixture[] = [scamPs5, cleanPs5, emptyBox];

export function getFixture(id: ScenarioId): ScenarioFixture {
  return FIXTURES[id];
}
