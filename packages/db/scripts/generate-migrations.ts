/**
 * Renders packages/db/drizzle into src/postgres/migrations.generated.ts so
 * the migrator needs no filesystem at runtime (safe inside a Next.js server
 * bundle). Run after every drizzle-kit generate:
 *   npm run db:bundle -w packages/db
 */
import { writeFileSync } from "node:fs";
import { GENERATED_MODULE, renderMigrationsModule } from "../src/postgres/migrations-source";

writeFileSync(GENERATED_MODULE, renderMigrationsModule());
console.log(`Wrote ${GENERATED_MODULE}`);
