/**
 * PayPal webhook receiver. Verifies the signature with the exact bytes
 * received, then hands the event to the handler in @pay-pals/paypal through
 * the service seam. 400 when verification fails, 500 when the handler asks
 * for a retry (PayPal redelivers), 200 otherwise.
 */
import type { WebhookEvent, WebhookHeaders } from "@pay-pals/contracts";
import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

const HEADER_NAMES = ["paypal-transmission-id", "paypal-transmission-time", "paypal-transmission-sig", "paypal-cert-url", "paypal-auth-algo"] as const;

function readHeaders(req: Request): WebhookHeaders | null {
  const out: Partial<WebhookHeaders> = {};
  for (const name of HEADER_NAMES) {
    const value = req.headers.get(name);
    if (!value) return null;
    out[name] = value;
  }
  return out as WebhookHeaders;
}

export async function POST(req: Request) {
  const services = getServices();
  await services.ready;
  const rawBody = await req.text();
  const headers = readHeaders(req);
  if (!headers) return NextResponse.json({ error: "Missing PayPal signature headers." }, { status: 400 });

  let verified = false;
  try {
    verified = await services.paypal.verifyWebhook(headers, rawBody);
  } catch (error) {
    console.warn(`[pay-pals] webhook verification errored: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!verified) return NextResponse.json({ error: "Webhook signature did not verify." }, { status: 400 });

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON." }, { status: 400 });
  }
  const outcome = await services.handleWebhook(event);
  console.info(`[pay-pals] webhook ${outcome.eventType} ${outcome.eventId}: ${outcome.note}`);
  return NextResponse.json(outcome, { status: outcome.retry ? 500 : 200 });
}
