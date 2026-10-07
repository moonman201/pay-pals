/**
 * PayPal configuration. Sandbox only: there is no code path to the live API.
 */

export const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

export interface PayPalConfig {
  env: "sandbox";
  clientId: string;
  clientSecret: string;
  /** Webhook id from the developer dashboard. Needed only for verifyWebhook. */
  webhookId: string | null;
  baseUrl: typeof SANDBOX_BASE_URL;
}

export class PayPalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalConfigError";
  }
}

/** Reads PAYPAL_* from an env map and refuses anything that is not sandbox. */
export function loadPayPalConfig(env: Record<string, string | undefined> = process.env): PayPalConfig {
  const mode = env.PAYPAL_ENV ?? "sandbox";
  if (mode !== "sandbox") {
    throw new PayPalConfigError(`PAYPAL_ENV must be "sandbox" (got "${mode}"). Pay Pals never talks to live PayPal.`);
  }
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new PayPalConfigError("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required. See .env.example.");
  }
  return {
    env: "sandbox",
    clientId,
    clientSecret,
    webhookId: env.PAYPAL_WEBHOOK_ID?.trim() || null,
    baseUrl: SANDBOX_BASE_URL,
  };
}

/** True when the environment has enough to call the sandbox. Tests use it to skip. */
export function hasSandboxCredentials(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}
