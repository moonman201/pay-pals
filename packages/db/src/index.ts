/**
 * Public surface of packages/db.
 *
 * - createMemoryDealStore(): no database. Demo mode and tests.
 * - createPostgresDealStore(databaseUrl): Drizzle on Postgres (Neon in production).
 * Both return PayPalsStore from contracts: the DealStore plus webhook receipts.
 * The schema is exported separately so migrations and tests can import it
 * without a database connection.
 */
export * as schema from "../schema";
export { createMemoryDealStore } from "./memory/memory-store";
export { createReplayClock, systemClock } from "./clock";
export type { Clock, ReplayClock, StoreOptions } from "./clock";
export { createPostgresDealStore, createPostgresDealStoreFromDb } from "./postgres/postgres-store";
export type { PostgresDealStore } from "./postgres/postgres-store";
export type { PayPalsStore, WebhookReceiptStore } from "@pay-pals/contracts";
export {
  AgreementNotAllowedError,
  CardLockedError,
  CardNotEditableError,
  CardNotFoundError,
  CardVersionError,
  DealNotFoundError,
  EventNotHashedError,
  EventOutOfOrderError,
  SellerJoinNotAllowedError,
} from "./errors";
export { backfillEventHashes } from "./postgres/backfill-hashes";
export { deleteSeededDemoDeals, explainDeal, FINISHED_STATES, FIXTURE_ORDER_PREFIX } from "./postgres/delete-seeded-demo-deals";
export type { CandidatePayment, DealExplanation, DeleteSeededOptions, DeleteSeededResult, SeededDealCandidate } from "./postgres/delete-seeded-demo-deals";
export { toCents, fromCents } from "./money";
