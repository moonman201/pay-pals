import { handle, readBody, type Params } from "@/lib/api/handle";
import { IssueBody } from "@/lib/api/schemas";
import { reportIssue } from "@/lib/deal/flows/close";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const body = await readBody(req, IssueBody);
    return reportIssue(getServices(), (await params).id, body.reason, body.details);
  });
}
