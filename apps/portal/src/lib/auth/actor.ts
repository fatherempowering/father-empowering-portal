import "server-only";

import {
  M1ContractError,
  type M1Role,
  type ServerActor,
  serverActorSchema,
} from "@/lib/contracts/m1";
import { assertActorRole, assertCoachAal2 } from "@/lib/auth/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export { assertActorRole, assertCoachAal2 } from "@/lib/auth/authorization";

export async function getServerActor(): Promise<ServerActor | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, role")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(2);

  // M1 has one active organization. Refuse an ambiguous session rather than
  // accidentally selecting permissions from the wrong organization.
  if (membershipError || memberships?.length !== 1) return null;

  const membership = memberships[0];
  let clientId: string | null = null;

  if (membership.role === "CLIENT") {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", membership.organization_id)
      .eq("auth_user_id", user.id)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (clientError || !client) return null;
    clientId = client.id;
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || !assurance?.currentLevel) return null;

  return serverActorSchema.parse({
    userId: user.id,
    organizationId: membership.organization_id,
    membershipId: membership.id,
    clientId,
    role: membership.role,
    aal: assurance.currentLevel,
  });
}

export async function requireActor(): Promise<ServerActor> {
  const actor = await getServerActor();
  if (!actor) throw new M1ContractError("UNAUTHENTICATED", "Authentication required", 401);
  return actor;
}

export async function requireRole(...allowedRoles: M1Role[]): Promise<ServerActor> {
  return assertActorRole(await requireActor(), ...allowedRoles);
}

export async function requireCoachAal2(): Promise<ServerActor> {
  return assertCoachAal2(await requireActor());
}
