/**
 * The error every PayPal call throws on a non-2xx response, carrying the
 * PayPal error body so a failure can be reported exactly.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: Array<{ issue?: string; description?: string; field?: string; value?: string }>;
  [key: string]: unknown;
}

export class PayPalApiError extends Error {
  readonly paypalName: string | undefined;
  readonly debugId: string | undefined;
  readonly details: PayPalErrorBody["details"];

  constructor(
    public readonly call: string,
    public readonly status: number,
    public readonly body: PayPalErrorBody,
  ) {
    const issue = body.details?.[0]?.issue;
    super(`PayPal ${call} failed with ${status}${body.name ? ` ${body.name}` : ""}${issue ? ` (${issue})` : ""}${body.message ? `: ${body.message}` : ""}`);
    this.name = "PayPalApiError";
    this.paypalName = body.name;
    this.debugId = body.debug_id;
    this.details = body.details;
  }
}

/** Parses JSON when there is any; an empty body becomes {}. */
export async function readJson(res: Response): Promise<PayPalErrorBody> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as PayPalErrorBody;
  } catch {
    return { message: text };
  }
}
