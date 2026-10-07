import { handle, readBody, type Params } from "@/lib/api/handle";
import { ByBody } from "@/lib/api/schemas";
import { buildEvidence } from "@/lib/deal/flows/evidence";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const body = await readBody(req, ByBody);
    return buildEvidence(getServices(), (await params).id, body.by);
  });
}
