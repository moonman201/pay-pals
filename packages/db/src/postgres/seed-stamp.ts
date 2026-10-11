/**
 * The seed stamp: data.seedVersion on a deal's deal_created event, which only
 * our demo seeder writes. Read as a correlated subquery so it can be selected
 * and filtered on beside the deals row. Shared by the stamp sweep and the
 * by-id delete, which both need to know whether a deal is one of ours.
 */
import { sql } from "drizzle-orm";

/**
 * data->>'seedVersion' of the deal's first deal_created event. The outer
 * column is written out as "deals"."id": inside a select list Drizzle
 * renders ${deals.id} as a bare "id", which the subquery would resolve to
 * the event's own id and read back null.
 */
export const seedVersionOf = sql<string | null>`(
  select e.data->>'seedVersion' from deal_events e
  where e.deal_id = "deals"."id" and e.kind = 'deal_created'
  order by e.at, e.id limit 1
)`;
