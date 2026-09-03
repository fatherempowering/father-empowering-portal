import { createRequestOtpHandler } from "@/features/client/http/activation-handlers";
import { getClientActivationWorkflow } from "@/features/client/server/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return createRequestOtpHandler({
    workflow: getClientActivationWorkflow(),
  })(request);
}
