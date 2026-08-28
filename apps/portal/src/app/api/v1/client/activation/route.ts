import { createInspectInvitationHandler } from "@/features/client/http/activation-handlers";
import { getClientActivationWorkflow } from "@/features/client/server/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return createInspectInvitationHandler({
    workflow: getClientActivationWorkflow(),
  })(request);
}
