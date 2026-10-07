import { handle, readBody, type Params } from "@/lib/api/handle";
import { MessageBody } from "@/lib/api/schemas";
import { postChat } from "@/lib/deal/flows/chat";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const body = await readBody(req, MessageBody);
    return postChat(getServices(), (await params).id, body.by, body.text);
  });
}
