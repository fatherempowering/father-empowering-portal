import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verified: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actor", () => ({ requireCoachVerified: mocks.verified }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
import { createPersonalClient } from "@/lib/clients/personal-client";
import { POST } from "@/app/api/v1/coach/personal-client/route";
import { M1ContractError } from "@/lib/contracts/m1";
const id = "41000000-0000-4000-8000-000000000001";
const body = { firstName: "Max", lastName: "Test", locale: "fr-CA", timeZone: "America/Montreal", idempotencyKey: id };
const origin = "https://preview.example.test";
const request = (input: unknown = body, from: string | null = origin, query = "") => new Request(`${origin}/api/v1/coach/personal-client${query}`, {
  method: "POST", headers: { "content-type": "application/json", ...(from === null ? {} : { origin: from }) }, body: JSON.stringify(input),
});
describe("Explicit staff own-profile creation", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", origin); mocks.rpc.mockResolvedValue({ data: { clientId: id }, error: null }); });
  afterEach(() => vi.unstubAllEnvs());
  it("passes only personal details to the owner-derived RPC", async () => {
    await expect(createPersonalClient(body)).resolves.toEqual({ clientId: id });
    expect(mocks.verified).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("create_own_client_profile", {
      p_first_name: "Max", p_last_name: "Test", p_locale: "fr-CA", p_time_zone: "America/Montreal", p_idempotency_key: id,
    });
  });
  it.each(["clientId", "userId", "organizationId", "email", "role"])("rejects caller-supplied identity field %s", async (field) => {
    const response = await POST(request({ ...body, [field]: "forged" }));
    expect(response.status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, "invalid", "https://attacker.example", "http://preview.example.test", "https://preview.example.test:8443"])("rejects invalid origin %s before authorization or mutation", async (from) => {
    const response = await POST(request(body, from));
    expect(response.status).toBe(403); expect(mocks.verified).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects identity parameters in the URL", async () => {
    const response = await POST(request(body, origin, `?clientId=${id}`));
    expect(response.status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns a no-store creation result", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ data: { clientId: id, redirectTo: "/client" } });
  });
  it("retains staff verification before any mutation", async () => {
    mocks.verified.mockRejectedValue(new M1ContractError("FORBIDDEN", "Verification required", 403));
    expect((await POST(request())).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["FE_IDEMPOTENCY_CONFLICT", "FE_PERSONAL_PROFILE_EXISTS", "FE_EMAIL_IDENTITY_CONFLICT"])("reports safe conflict for %s", async (message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "INVALID_STATE", message: "Personal profile cannot be created in its current state" } });
  });
  it.each([["FE_UNAUTHENTICATED", 401], ["FE_FORBIDDEN", 403], ["FE_INVALID_IDENTITY", 400], ["FE_INVALID_INPUT", 400]])("retains the safe failure status for %s", async (message, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain(message);
  });
  it("does not disclose arbitrary provider errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private identity content" } });
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private identity");
  });
});
