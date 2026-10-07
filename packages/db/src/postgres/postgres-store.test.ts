/**
 * Runs the conformance suite against a real Postgres at TEST_DATABASE_URL
 * (a Neon branch or a local database set aside for tests). Skips itself when
 * TEST_DATABASE_URL is unset. It applies migrations and writes rows, which is
 * why it does not read DATABASE_URL: the app's database must never be a test
 * target.
 */
import { afterAll, beforeAll, describe } from "vitest";
import { runDealStoreConformance } from "../conformance/deal-store.conformance";
import { createPostgresDealStore, type PostgresDealStore } from "./postgres-store";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("postgres (TEST_DATABASE_URL)", () => {
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
