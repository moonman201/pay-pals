/**
 * The demo seed version. Bump it whenever the fixtures or the seeder change
 * so a durable store can tell a stale seeded deal from a current one. The
 * seeder stamps it into each seeded deal's deal_created event data as
 * { seedVersion, scenario }; qa asserts on the constant.
 */
export const SEED_VERSION = "2026-10-12.1";

/** The seed stamp on a seeded deal's deal_created event, when it has one. */
export interface SeedStamp {
  seedVersion: string;
  scenario: string;
}

export function readSeedStamp(data: Record<string, unknown> | undefined | null): SeedStamp | null {
  if (!data) return null;
  const { seedVersion, scenario } = data as { seedVersion?: unknown; scenario?: unknown };
  return typeof seedVersion === "string" && typeof scenario === "string" ? { seedVersion, scenario } : null;
}
