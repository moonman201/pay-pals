/**
 * Wraps a route handler: parses the body with a Zod schema, turns known
 * errors into plain JSON with the right status, hides the rest.
 */
import { IllegalTransitionError } from "@pay-pals/contracts";
import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type output } from "zod";
import { FlowError } from "../deal/errors";

export type Params = { params: Promise<{ id: string }> };

/** Error names from @pay-pals/agents, @pay-pals/db and @pay-pals/paypal and the status each deserves. */
const NAMED_STATUS: Record<string, number> = {
  MissingPriceError: 400,
  CardLockedError: 409,
  CardVersionError: 409,
  CardNotLockedError: 409,
  CardNotFoundError: 404,
  DealNotFoundError: 404,
  PayPalConfigError: 503,
  PayPalApiError: 502,
};

export async function readBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<output<S>> {
  const raw = await req.text();
  const json: unknown = raw ? JSON.parse(raw) : {};
  return schema.parse(json) as output<S>;
}

export async function handle(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    if (e instanceof FlowError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof IllegalTransitionError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Body is not valid JSON." }, { status: 400 });
    // Errors the packages raise on purpose, matched by name so apps/web does not import their classes.
    if (e instanceof Error && e.name in NAMED_STATUS) return NextResponse.json({ error: e.message }, { status: NAMED_STATUS[e.name] });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}
