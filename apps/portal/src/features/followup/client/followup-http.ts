export class FollowupHttpError extends Error {
  constructor(readonly status: number | "NETWORK" | "RESPONSE") { super(String(status)); }
}

export async function followupRequest<T>(url: string, parse: (value: unknown) => T, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      cache: "no-store", signal: controller.signal,
      ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (response.status === 401 || response.status === 403) window.location.replace("/client-login");
    if (!response.ok) throw new FollowupHttpError(response.status);
    try { return parse((await response.json()).data); }
    catch { throw new FollowupHttpError("RESPONSE"); }
  } catch (error) {
    if (error instanceof FollowupHttpError) throw error;
    throw new FollowupHttpError("NETWORK");
  } finally { clearTimeout(timeout); }
}
