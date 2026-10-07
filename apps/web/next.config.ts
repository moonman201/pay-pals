import type { NextConfig } from "next";

/**
 * Workspace packages export TypeScript source (ADR 0001), so Next must
 * transpile them. Add "@pay-pals/agents", "@pay-pals/paypal" and
 * "@pay-pals/db" here when lib/services.ts starts importing them.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@pay-pals/contracts"],
  reactStrictMode: true,
};

export default nextConfig;
