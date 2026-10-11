/**
 * Deletes named deals. Every id is given in full and matched exactly: there
 * is no prefix, pattern or range form, because the ids that get cleared this
 * way are picked by a person reading a list, and a pattern is how you delete
 * the row next to the one you meant.
 *
 * It is all or nothing. If any id is not a deal in this database the call
 * deletes nothing and hands back which ones were refused, so a typo in one id
 * cannot quietly take the other six with it while reporting success.
 *
 * A deal carrying a seed stamp is one of our demo seeds. Those are reported
 * as stamped and still deleted when asked, because the caller may really mean
 * it, but the sweep in delete-seeded-demo-deals.ts is the right tool for a
 * seed and this path should say so out loud.
 *
 * Children go with the deal through the schema's ON DELETE CASCADE: item
 * cards, messages, verdicts, payments, shipments, evidence packs and deal
 * events. Rows in webhook_receipts are keyed by PayPal's event id, carry no
 * deal id and stay, which is what keeps a replayed webhook idempotent.
 */
import { inArray } from "drizzle-orm";
import { deals } from "../../schema";
import type { Db } from "./db";
import { seedVersionOf } from "./seed-stamp";
import { isUuid } from "./uuid";

/** Why an id was refused. "not a deal id" covers a prefix or any other non-uuid. */
export type ByIdRefusal = "not a deal id" | "no such deal";

export interface DealByIdTarget {
  id: string;
  /** Null when the deal is there to delete, otherwise why it was refused. */
  refusal: ByIdRefusal | null;
  scenario: string | null;
  state: string | null;
  createdAt: string | null;
  /** data.seedVersion from the deal_created event. Set means this is one of our demo seeds. */
  seedVersion: string | null;
}

export interface DeleteByIdOptions {
  /** Full deal uuids, each one spelled out. Duplicates are collapsed. */
  ids: readonly string[];
  dryRun: boolean;
}

export interface DeleteByIdResult {
  /** One entry per distinct id given, in the order given. */
  targets: DealByIdTarget[];
  /** The refused ones. While this is non-empty nothing is deleted. */
  refused: DealByIdTarget[];
  /** Targets that carry a seed stamp, so the caller can be told before they go. */
  stamped: DealByIdTarget[];
  deleted: number;
}

/** Distinct, in the order first seen, so the report lines up with what was typed. */
function distinct(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export async function deleteDealsById(db: Db, options: DeleteByIdOptions): Promise<DeleteByIdResult> {
  const ids = distinct(options.ids);
  if (ids.length === 0) return { targets: [], refused: [], stamped: [], deleted: 0 };

  // Postgres rejects a non-uuid against a uuid column, so these never reach the query.
  const wellFormed = ids.filter((id) => isUuid(id));
  const found = wellFormed.length
    ? await db
        .select({ id: deals.id, scenario: deals.scenario, state: deals.state, createdAt: deals.createdAt, seedVersion: seedVersionOf })
        .from(deals)
        .where(inArray(deals.id, wellFormed))
    : [];
  const byId = new Map(found.map((r) => [r.id, r]));

  const targets: DealByIdTarget[] = ids.map((id) => {
    if (!isUuid(id)) return { id, refusal: "not a deal id", scenario: null, state: null, createdAt: null, seedVersion: null };
    const row = byId.get(id);
    if (!row) return { id, refusal: "no such deal", scenario: null, state: null, createdAt: null, seedVersion: null };
    return {
      id,
      refusal: null,
      scenario: row.scenario,
      state: row.state,
      createdAt: row.createdAt.toISOString(),
      seedVersion: row.seedVersion ?? null,
    };
  });

  const refused = targets.filter((t) => t.refusal !== null);
  const stamped = targets.filter((t) => t.refusal === null && t.seedVersion !== null);
  // One bad id refuses the whole call. Deleting the rest would report success
  // for a list the caller never checked.
  if (refused.length > 0 || options.dryRun) return { targets, refused, stamped, deleted: 0 };

  const gone = await db
    .delete(deals)
    .where(inArray(deals.id, targets.map((t) => t.id)))
    .returning({ id: deals.id });
  return { targets, refused, stamped, deleted: gone.length };
}
