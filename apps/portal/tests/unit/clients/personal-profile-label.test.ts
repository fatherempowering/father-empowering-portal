import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachClientLabel } from "@/lib/clients/client-label";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireCoachVerified: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mocks }));
import { listCoachClients } from "@/lib/clients/m1-repository";

describe("personal Coach profile presentation", () => {
  beforeEach(() => vi.resetAllMocks());
  it("adds an explicit label without renaming either person", () => {
    expect(coachClientLabel("Maxime Bourdon", true)).toBe("Maxime Bourdon — Mon profil personnel");
    expect(coachClientLabel("Maxime Bourdon", false)).toBe("Maxime Bourdon");
    expect(coachClientLabel("Maxime Bourdon")).toBe("Maxime Bourdon");
  });
  it("derives ownership from server identity and organization, not name or email", async () => {
    mocks.auth.mockResolvedValue({userId:"owner",organizationId:"org"});
    const records = [
      {id:"ordinary",organization_id:"org",auth_user_id:"other"},
      {id:"personal",organization_id:"org",auth_user_id:"owner"},
      {id:"different-org",organization_id:"another",auth_user_id:"owner"},
    ].map(item => ({...item,first_name:"Maxime",last_name:"Bourdon",email:"same@example.test",status:"ACTIVE",locale:"fr-CA"}));
    mocks.from.mockImplementation((table: string) => {
      const data = table === "clients" ? records : table === "coach_client_assignments"
        ? records.map(record => ({client_id:record.id,coach_user_id:"owner"})) : [];
      return Object.assign(Promise.resolve({data,error:null}),{select:vi.fn().mockReturnThis(),in:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis()});
    });
    const result = await listCoachClients();
    expect(result.map(item => item.isOwnProfile)).toEqual([false,true,false]);
    expect(result.map(item => item.client.displayName)).toEqual(["Maxime Bourdon","Maxime Bourdon","Maxime Bourdon"]);
    expect(mocks.from.mock.calls.map(call => call[0])).toEqual(["clients","coach_client_assignments","client_invitations"]);
  });
  it("does not query client data if Coach verification fails", async () => {
    mocks.auth.mockRejectedValue(new Error("DENIED"));
    await expect(listCoachClients()).rejects.toThrow("DENIED");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
