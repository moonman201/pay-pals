/**
 * drizzle-kit config. Generate a migration after a schema change (Lead only):
 *   npx drizzle-kit generate --config packages/db/drizzle.config.ts
 * Apply migrations to DATABASE_URL:
 *   npm run migrate -w packages/db
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/pay_pals" },
  strict: true,
  verbose: true,
});
