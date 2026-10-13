import type { ScenarioId } from "@pay-pals/contracts";

/** Sandbox payee per scenario. Only scenarios whose story does not depend on the address appear. */
export type DemoPayees = Partial<Record<ScenarioId, string>>;

/** Scenarios whose payee address is part of the story. fake-slab's address is the scam evidence, so it is never swapped. */
const ADDRESS_IS_EVIDENCE: readonly ScenarioId[] = ["fake-slab"];

const KEYS: Partial<Record<ScenarioId, string>> = {
  "clean-ps5": "SANDBOX_SELLER_EMAIL_CLEAN_PS5",
  "empty-box": "SANDBOX_SELLER_EMAIL_EMPTY_BOX",
};

/**
 * Reads the per-scenario sandbox payees. Each scenario's own key wins; the shared
 * SANDBOX_SELLER_PERSONAL_EMAIL is the fallback. Server-only, and never logged.
 */
export function demoPayeesFromEnv(env: Record<string, string | undefined>): DemoPayees {
  const fallback = env.SANDBOX_SELLER_PERSONAL_EMAIL?.trim() || null;
  const out: DemoPayees = {};
  for (const [scenario, key] of Object.entries(KEYS) as [ScenarioId, string][]) {
    const email = env[key]?.trim() || fallback;
    if (email) out[scenario] = email;
  }
  return out;
}

/** The sandbox payee that replaces a scenario's fixture payee, or null to keep the fixture address. */
export function demoPayeeFor(payees: DemoPayees | null, scenario: ScenarioId): string | null {
  if (ADDRESS_IS_EVIDENCE.includes(scenario)) return null;
  return payees?.[scenario] ?? null;
}
