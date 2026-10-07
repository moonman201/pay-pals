import type { NextConfig } from "next";
import path from "node:path";

/**
 * Workspace packages export TypeScript source (ADR 0001), so Next must
 * transpile them. Add "@pay-pals/agents", "@pay-pals/paypal" and
 * "@pay-pals/db" here when lib/services.ts starts importing them.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@pay-pals/contracts"],
  reactStrictMode: true,
  // The monorepo root holds the only lockfile.
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
};

export default nextConfig;
