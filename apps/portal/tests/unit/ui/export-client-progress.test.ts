import { describe, expect, it, vi } from "vitest";
import { exportClientProgress } from "@/features/client/dashboard/export-client-progress";

const progression = { baseline: null, checkIns: [], checkInsTruncated: false, checkInsTotal: 0, completedWorkouts: { total: 0, dates: [], datesTruncated: false } };
const nutrition = { publication: null, history: [], historyTruncated: false };
const training = { program: null };
function request(overrides: Record<string, unknown> = {}) {
  const documents: Record<string, unknown> = { "/api/v1/client/progression": progression, "/api/v1/client/nutrition": nutrition, "/api/v1/client/program": training, ...overrides };
  return vi.fn(async (path: string) => new Response(JSON.stringify({ data: documents[path], ignoredEnvelopeSecret: "DO_NOT_EXPORT" }))) as unknown as ReturnType<typeof vi.fn> & typeof fetch;
}
describe("private progress export", () => {
  it("reads only the three authenticated own-Client APIs; never exports raw envelopes or storage", async () => {
    const fetcher = request();
    const exported = await exportClientProgress(fetcher);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/v1/client/progression", "/api/v1/client/nutrition", "/api/v1/client/program"]);
    for (const call of fetcher.mock.calls) expect(call[1]).toMatchObject({ cache: "no-store", credentials: "same-origin", signal: expect.any(AbortSignal) });
    expect(exported).toMatchObject({ format: "father-empowering-progress-v1", progression, nutrition, training, truncated: false });
    expect(JSON.stringify(exported)).not.toContain("DO_NOT_EXPORT");
  });
  it.each(["/api/v1/client/progression", "/api/v1/client/nutrition", "/api/v1/client/program"])("fails closed on unexpected private fields in %s", async path => {
    const data = path.endsWith("progression") ? progression : path.endsWith("nutrition") ? nutrition : training;
    await expect(exportClientProgress(request({ [path]: { ...data, access_token: "DO_NOT_EXPORT", photoUrl: "private" } }))).rejects.toThrow();
  });
  it.each([401, 403, 500])("produces no partial export when a read fails with %s", async status => {
    const fetcher = vi.fn(async () => new Response("private provider details", { status }));
    await expect(exportClientProgress(fetcher)).rejects.toThrow("EXPORT_UNAVAILABLE");
  });
  it("identifies bounded history explicitly", async () => {
    const result = await exportClientProgress(request({ "/api/v1/client/nutrition": { ...nutrition, historyTruncated: true } }));
    expect(result.truncated).toBe(true);
    expect(result.scope).toContain("Not a restorable account backup");
  });
});
