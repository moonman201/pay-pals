import { handle, readBody, type Params } from "@/lib/api/handle";
import { AgreeBody } from "@/lib/api/schemas";
import { agree } from "@/lib/deal/flows/agree";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const body = await readBody(req, AgreeBody);
    return agree(getServices(), (await params).id, body.by, body.override);
  });
}
