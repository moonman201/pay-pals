import type { NextConfig } from "next";
import path from "node:path";

/**
 * Workspace packages export TypeScript source (ADR 0001), so Next must
 * transpile them. Their heavy runtime dependencies stay external to the
 * server bundle: pg has optional native bindings and the Anthropic SDK is
 * happier loaded from node_modules.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@pay-pals/contracts", "@pay-pals/agents", "@pay-pals/db", "@pay-pals/paypal"],
  serverExternalPackages: ["pg", "drizzle-orm", "@anthropic-ai/sdk"],
  reactStrictMode: true,
  // The monorepo root holds the only lockfile.
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
};

export default nextConfig;
