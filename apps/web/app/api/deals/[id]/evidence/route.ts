/** GET: the saved evidence pack, 404 when none. POST: build (or rebuild) it. */
import { handle, readBody, type Params } from "@/lib/api/handle";
import { ByBody } from "@/lib/api/schemas";
import { notFound } from "@/lib/deal/errors";
import { buildEvidence } from "@/lib/deal/flows/evidence";
import { getServices } from "@/lib/services";

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const services = getServices();
    await services.ready;
    const { id } = await params;
    if (!(await services.store.getDeal(id))) throw notFound("Deal");
    const pack = await services.store.getEvidence(id);
    if (!pack) throw notFound("Evidence pack");
    return pack;
  });
}

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const body = await readBody(req, ByBody);
    return buildEvidence(getServices(), (await params).id, body.by);
  });
}
