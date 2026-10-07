import { handle, readBody, type Params } from "@/lib/api/handle";
import { JoinBody } from "@/lib/api/schemas";
import { joinAsBuyer } from "@/lib/deal/flows/start";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const body = await readBody(req, JoinBody);
    return joinAsBuyer(getServices(), (await params).id, { role: "buyer", ...body });
  });
}
