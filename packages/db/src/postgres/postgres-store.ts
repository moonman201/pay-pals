/**
 * Postgres DealStore: composes the repositories into the store interface.
 * createPostgresDealStore(url) connects with node-postgres (Neon in
 * production). createPostgresDealStoreFromDb(db) takes any Drizzle Postgres
 * handle, which is how the conformance suite runs on PGlite.
 */
import type { PayPalsStore } from "../store-types";
import { cardsRepo } from "./cards";
import { connectPostgres, type Db } from "./db";
import { dealsRepo } from "./deals";
import { evidenceRepo } from "./evidence";
import { eventsRepo } from "./events";
import { messagesRepo } from "./messages";
import { paymentsRepo } from "./payments";
import { receiptsRepo } from "./receipts";
import { shipmentsRepo } from "./shipments";
import { verdictsRepo } from "./verdicts";

export interface PostgresDealStore extends PayPalsStore {
  /** Applies pending migrations from packages/db/drizzle. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export function createPostgresDealStoreFromDb(db: Db): PayPalsStore {
  const deals = dealsRepo(db);
  const { lockRow, ...dealMethods } = deals;
  return {
    ...dealMethods,
    ...cardsRepo(db, lockRow),
    ...messagesRepo(db),
    ...verdictsRepo(db),
    ...paymentsRepo(db),
    ...shipmentsRepo(db),
    ...evidenceRepo(db),
    ...eventsRepo(db),
    ...receiptsRepo(db),
  };
}

export function createPostgresDealStore(databaseUrl: string): PostgresDealStore {
  const connection = connectPostgres(databaseUrl);
  return {
    ...createPostgresDealStoreFromDb(connection.db),
    migrate: connection.migrate,
    close: connection.close,
  };
}
