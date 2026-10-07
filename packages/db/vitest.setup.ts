// Loads the repo root .env.local (if present) so the DATABASE_URL test can run.
import { loadEnvLocal } from "./src/load-env";

loadEnvLocal();
