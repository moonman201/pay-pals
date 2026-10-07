// Loads the repo root .env.local (if present) so the sandbox tests can find
// PAYPAL_CLIENT_ID. Unit tests never read it.
import { loadEnvLocal } from "./src/load-env";

loadEnvLocal();
