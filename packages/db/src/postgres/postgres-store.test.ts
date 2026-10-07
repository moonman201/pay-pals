/**
 * Runs the conformance suite against a real Postgres at DATABASE_URL (Neon
 * or local). Skips itself when DATABASE_URL is unset. Applies migrations
 * first, so an empty database works.
 */
import { afterAll, beforeAll, describe } from "vitest";
import { runDealStoreConformance } from "../conformance/deal-store.conformance";
import { createPostgresDealStore, type PostgresDealStore } from "./postgres-store";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("postgres (DATABASE_URL)", () => {
  let store: PostgresDealStore;

  beforeAll(async () => {
    store = createPostgresDealStore(url!);
    await store.migrate();
  }, 60_000);

  afterAll(async () => {
    await store?.close();
  });

  runDealStoreConformance("postgres", async () => store);
});
