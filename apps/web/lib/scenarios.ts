/**
 * Demo scenario lookup. The fixtures are a contract artifact, not a mock:
 * the landing page, demo hints and the evidence fallback read them here.
 */
import { ALL_FIXTURES, type ScenarioFixture, type ScenarioId } from "@pay-pals/contracts";

export function fixtureById(id: ScenarioId | null | undefined): ScenarioFixture | null {
  if (!id) return null;
  return ALL_FIXTURES.find((f) => f.id === id) ?? null;
}
