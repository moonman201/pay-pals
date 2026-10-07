/** POST scenario + side from the landing page; creates a fresh demo deal and opens its room. */
import { SCENARIO_IDS } from "@pay-pals/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";
import { startDemoDeal } from "@/lib/deal/flows/start";
import { parseRole } from "@/lib/role";
import { getServices } from "@/lib/services";

const Body = z.object({ scenario: z.enum(SCENARIO_IDS), as: z.string().optional() });

export async function POST(req: Request) {
  const form = await req.formData();
  const parsed = Body.safeParse({ scenario: form.get("scenario"), as: form.get("as") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Unknown scenario." }, { status: 400 });
  const deal = await startDemoDeal(getServices(), parsed.data.scenario);
  const role = parseRole(parsed.data.as);
  return NextResponse.redirect(new URL(`/deals/${deal.id}?as=${role}`, req.url), 303);
}
