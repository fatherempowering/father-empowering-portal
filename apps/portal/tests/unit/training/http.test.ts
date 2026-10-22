import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { M1ContractError } from "@/lib/contracts/m1";

const repository = vi.hoisted(() => ({ listTrainingExercises: vi.fn(), saveTrainingExercise: vi.fn() }));
vi.mock("@/lib/training/exercise-repository", () => repository);
import { listExercisesHttp, saveExerciseHttp } from "@/features/training/server/exercise-http";

const command = {
  id: null, expectedVersion: 0, clientMutationId: "10000000-0000-4000-8000-000000000005",
  exercise: { name: "Dumbbell Press", equipment: "", cue: { fr: "", en: "" }, defaultUnit: "lb", archived: false },
};
const request = (origin: string | null = "https://staging.example", body: unknown = command) => new Request("http://internal:3000/api/v1/coach/exercises", {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
});

describe("Exercise library HTTP boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.example");
    repository.listTrainingExercises.mockResolvedValue({ items: [], total: 0, page: 0, pageSize: 50 });
    repository.saveTrainingExercise.mockResolvedValue({ id: "saved" });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("lists only through the guarded repository with no-store responses", async () => {
    const response = await listExercisesHttp(new Request("https://staging.example/api/v1/coach/exercises?query=Press"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(repository.listTrainingExercises).toHaveBeenCalledWith({ page: 0, query: "Press", archived: "false" });
  });
  it("accepts the exact canonical origin despite a different internal URL", async () => {
    const response = await saveExerciseHttp(request());
    expect(response.status).toBe(200);
    expect(repository.saveTrainingExercise).toHaveBeenCalledWith(command);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each([null, "null", "https://attacker.example", "https://staging.example:444", "http://staging.example"])("rejects origin %s before mutation", async (origin) => {
    expect((await saveExerciseHttp(request(origin))).status).toBe(403);
    expect(repository.saveTrainingExercise).not.toHaveBeenCalled();
  });
  it("fails closed without a configured origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect((await saveExerciseHttp(request())).status).toBe(403);
  });
  it("rejects forged actor fields and oversized bodies", async () => {
    expect((await saveExerciseHttp(request(undefined, { ...command, organizationId: "forged" }))).status).toBe(400);
    expect((await saveExerciseHttp(request(undefined, { padding: "x".repeat(8_193) }))).status).toBe(400);
    expect(repository.saveTrainingExercise).not.toHaveBeenCalled();
  });
  it.each(["page=-1", "archived=any", "organizationId=forged"])("rejects invalid filters %s", async (query) => {
    expect((await listExercisesHttp(new Request(`https://staging.example/api/v1/coach/exercises?${query}`))).status).toBe(400);
    expect(repository.listTrainingExercises).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 409])("preserves denial status %i", async (status) => {
    repository.saveTrainingExercise.mockRejectedValue(new M1ContractError("FORBIDDEN", "Operation denied", status));
    expect((await saveExerciseHttp(request())).status).toBe(status);
  });
  it("does not expose an unexpected exception", async () => {
    repository.saveTrainingExercise.mockRejectedValue(new Error("PRIVATE_DATABASE_DETAIL"));
    const response = await saveExerciseHttp(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE_DATABASE_DETAIL");
  });
});
