/**
 * Public surface of packages/db.
 *
 * - createMemoryDealStore(): no database. Demo mode and tests.
 * - createPostgresDealStore(databaseUrl): Drizzle on Postgres (Neon in production).
 * Both return PayPalsStore: the DealStore from contracts plus webhook receipts.
 * The schema is exported separately so migrations and tests can import it
 * without a database connection.
 */
export * as schema from "../schema";
export { createMemoryDealStore } from "./memory/memory-store";
export { createPostgresDealStore, createPostgresDealStoreFromDb } from "./postgres/postgres-store";
export type { PostgresDealStore } from "./postgres/postgres-store";
export type { PayPalsStore } from "./store-types";
export type { WebhookReceiptStore } from "./webhook-receipts";
export { CardLockedError, CardNotFoundError, CardVersionError, DealNotFoundError } from "./errors";
export { toCents, fromCents } from "./money";
