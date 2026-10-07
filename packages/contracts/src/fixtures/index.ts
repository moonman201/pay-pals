import type { ScenarioId } from "../deal";
import { fakeSlab } from "./fake-slab";
import { cleanPs5 } from "./clean-ps5";
import { emptyBox } from "./empty-box";
import type { ScenarioFixture } from "./types";

export type { ScenarioFixture, ExpectedVerdict, ExpectedArrival } from "./types";
export { fakeSlab, cleanPs5, emptyBox };
export { FAKE_SLAB_CERT } from "./fake-slab";
export { CLEAN_SERIAL } from "./clean-ps5";
export { EMPTY_BOX_LOCKED_SERIAL } from "./empty-box";

export const FIXTURES: Readonly<Record<ScenarioId, ScenarioFixture>> = {
  "fake-slab": fakeSlab,
  "clean-ps5": cleanPs5,
  "empty-box": emptyBox,
};

export const ALL_FIXTURES: readonly ScenarioFixture[] = [fakeSlab, cleanPs5, emptyBox];

export function getFixture(id: ScenarioId): ScenarioFixture {
  return FIXTURES[id];
}
