import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAssurance: vi.fn(),
  membershipLimit: vi.fn(),
  clientSingle: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  createClient: vi.fn(),
  readPilotCatalog: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createClient }));
vi.mock("@/lib/training/pilot/catalog.server", () => ({ readPilotCatalog: mocks.readPilotCatalog }));

// The production role/session guard is deliberately not mocked. Only its
// Supabase boundary and the eventual catalog read are replaced in these tests.
import { listExercisePilotHttp } from "@/features/training/server/exercise-pilot-http";
import * as route from "@/app/api/v1/coach/exercise-pilot/route";

const userId = "11000000-0000-4000-8000-000000000001";
const membershipId = "21000000-0000-4000-8000-000000000001";
const organizationId = "31000000-0000-4000-8000-000000000001";
const clientId = "41000000-0000-4000-8000-000000000001";
const emptyCatalog = {
  sourceCatalogVersion: "3.1.0-pilot.1",
  integrationVersion: "fe-pilot.1",
  items: [], total: 0, catalogSize: 15,
  equipmentOptions: [
    { id: "dumbbell", labels: { fr: "Haltères", en: "Dumbbells" } },
    { id: "barbell", labels: { fr: "Barre", en: "Barbell" } },
    { id: "cable", labels: { fr: "Câbles", en: "Cables" } },
    { id: "machine", labels: { fr: "Machines", en: "Machines" } },
    { id: "bodyweight", labels: { fr: "Poids du corps", en: "Bodyweight" } },
    { id: "kettlebell", labels: { fr: "Kettlebell", en: "Kettlebell" } },
    { id: "band", labels: { fr: "Bandes", en: "Bands" } },
  ],
};

function membership(role: "ADMIN" | "COACH" | "CLIENT") {
  return { id: membershipId, organization_id: organizationId, role };
}

function request(query = "") {
  return new Request(`https://staging.example/api/v1/coach/exercise-pilot${query ? `?${query}` : ""}`);
}

function expectNotCached(response: Response) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("cache-control")).toContain("max-age=0");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("pilot HTTP boundary using the real verified Coach guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.membershipLimit.mockResolvedValue({ data: [membership("ADMIN")], error: null });
    mocks.clientSingle.mockResolvedValue({ data: { id: clientId }, error: null });
    mocks.getAssurance.mockResolvedValue({ data: { currentLevel: "aal1" }, error: null });
    mocks.rpc.mockResolvedValue({ data: { verified: true }, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table !== "organization_memberships" && table !== "clients") throw new Error("Unexpected table access");
      const query = {
        select: vi.fn(), eq: vi.fn(),
        limit: mocks.membershipLimit, maybeSingle: mocks.clientSingle,
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser, mfa: { getAuthenticatorAssuranceLevel: mocks.getAssurance } },
      from: mocks.from, rpc: mocks.rpc,
    });
    mocks.readPilotCatalog.mockReturnValue(structuredClone(emptyCatalog));
  });

  it("exports only a dynamic GET, with no mutation route", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic"]);
    expect(route.GET).toBe(listExercisePilotHttp);
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("rejects an anonymous request before reading the catalog or resolving filters", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await route.GET(request("unexpected=private"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expectNotCached(response);
  });

  it("rejects an invalid Auth user response without exposing provider details", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "PRIVATE_AUTH_PROVIDER_DETAIL" } });
    const response = await route.GET(request());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("PRIVATE_AUTH_PROVIDER_DETAIL");
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
  });

  it("rejects an active Client even if the unused staff verification mock would succeed", async () => {
    mocks.membershipLimit.mockResolvedValue({ data: [membership("CLIENT")], error: null });
    const response = await route.GET(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(mocks.clientSingle).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
    expectNotCached(response);
  });

  it.each(["ADMIN", "COACH"] as const)("rejects an unverified %s before catalog access", async (role) => {
    mocks.membershipLimit.mockResolvedValue({ data: [membership(role)], error: null });
    mocks.rpc.mockResolvedValue({ data: { verified: false }, error: null });
    const response = await route.GET(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_coach_email_verification_status");
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
    expectNotCached(response);
  });

  it.each([null, {}, { verified: "true" }, { verified: 1 }])("fails closed for malformed verification data %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const response = await route.GET(request());
    expect(response.status).toBe(403);
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
  });

  it("does not treat AAL2 alone as the required verified Coach attestation", async () => {
    mocks.getAssurance.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
    mocks.rpc.mockResolvedValue({ data: { verified: false }, error: null });
    const response = await route.GET(request());
    expect(response.status).toBe(403);
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
  });

  it.each([
    { role: "ADMIN", aal: "aal1" }, { role: "ADMIN", aal: "aal2" },
    { role: "COACH", aal: "aal1" }, { role: "COACH", aal: "aal2" },
  ] as const)("allows $role / $aal only after the actual private verification check", async ({ role, aal }) => {
    mocks.membershipLimit.mockResolvedValue({ data: [membership(role)], error: null });
    mocks.getAssurance.mockResolvedValue({ data: { currentLevel: aal }, error: null });
    const response = await route.GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: emptyCatalog });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.getAssurance).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_coach_email_verification_status");
    expect(mocks.readPilotCatalog).toHaveBeenCalledExactlyOnceWith({ query: "", equipment: "", stabilizers: "false" });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.readPilotCatalog.mock.invocationCallOrder[0]);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("vary")).toBe("Cookie");
    expectNotCached(response);
  });

  it("passes validated and normalized filters only to the read-only catalog", async () => {
    const response = await route.GET(request(new URLSearchParams({ query: "  ischio-fessiers  ", equipment: "barbell", stabilizers: "true" }).toString()));
    expect(response.status).toBe(200);
    expect(mocks.readPilotCatalog).toHaveBeenCalledExactlyOnceWith({ query: "ischio-fessiers", equipment: "barbell", stabilizers: "true" });
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["organization_memberships"]);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_coach_email_verification_status");
  });

  it.each([
    "query=first&query=second", "equipment=dumbbell&equipment=barbell", "stabilizers=true&stabilizers=false",
    "unknown=value", "organizationId=forged", "page=0", "equipment=unknown", "stabilizers=1",
    `query=${"x".repeat(121)}`,
  ])("rejects ambiguous, unknown or oversized filters without reading the catalog: %s", async (query) => {
    const response = await route.GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "VALIDATION_FAILED", message: "Invalid request." } });
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
    expectNotCached(response);
  });

  it.each([
    { label: "missing", data: [] },
    { label: "ambiguous", data: [membership("ADMIN"), { ...membership("COACH"), id: "21000000-0000-4000-8000-000000000002" }] },
  ])("rejects $label active membership", async ({ data }) => {
    mocks.membershipLimit.mockResolvedValue({ data, error: null });
    const response = await route.GET(request());
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
  });

  it("rejects an unreadable membership store without exposing its error", async () => {
    mocks.membershipLimit.mockResolvedValue({ data: null, error: { message: "PRIVATE_MEMBERSHIP_DETAIL" } });
    const response = await route.GET(request());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("PRIVATE_MEMBERSHIP_DETAIL");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
  });

  it("rejects an unavailable assurance response before private verification or catalog access", async () => {
    mocks.getAssurance.mockResolvedValue({ data: null, error: { message: "PRIVATE_ASSURANCE_DETAIL" } });
    const response = await route.GET(request());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("PRIVATE_ASSURANCE_DETAIL");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
  });

  it("preserves the password-session-required denial without exposing raw verification details", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "FE_COACH_PASSWORD_SESSION_REQUIRED PRIVATE_VERIFICATION_DETAIL" } });
    const response = await route.GET(request());
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).toContain("UNAUTHENTICATED");
    expect(body).not.toContain("PRIVATE_VERIFICATION_DETAIL");
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
  });

  it("hides unreadable private verification storage errors and denies catalog access", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE_VERIFICATION_DETAIL" } });
    const response = await route.GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "TEMPORARILY_UNAVAILABLE", message: "Unable to verify the Coach session" } });
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
    expectNotCached(response);
  });

  it("sanitizes an unexpected Auth exception before catalog access", async () => {
    mocks.getUser.mockRejectedValue(new Error("PRIVATE_AUTH_EXCEPTION"));
    const response = await route.GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "TEMPORARILY_UNAVAILABLE", message: "Service temporarily unavailable." } });
    expect(mocks.readPilotCatalog).not.toHaveBeenCalled();
    expectNotCached(response);
  });

  it("sanitizes an unexpected catalog exception without returning partial data", async () => {
    mocks.readPilotCatalog.mockImplementation(() => { throw new Error("PRIVATE_CATALOG_EXCEPTION"); });
    const response = await route.GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "TEMPORARILY_UNAVAILABLE", message: "Service temporarily unavailable." } });
    expectNotCached(response);
  });
});
