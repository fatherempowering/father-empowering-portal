import { createVerifyOtpHandler } from "@/features/client/http/activation-handlers";
import { getClientActivationWorkflow } from "@/features/client/server/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return createVerifyOtpHandler({
    workflow: getClientActivationWorkflow(),
  })(request);
}
