/**
 * Public surface of packages/db. builder-paypal fills this in with the
 * DealStore implementation. The schema is exported separately so migrations
 * and tests can import it without a database connection.
 */
export * as schema from "../schema";
