export class FollowupHttpError extends Error {
  constructor(readonly status: number | "NETWORK" | "RESPONSE" | "CANCELLED") { super(String(status)); }
}

export async function followupRequest<T>(url: string, parse: (value: unknown) => T, body?: unknown, lifecycle?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const cancelRead = () => controller.abort();
  // Stop reads on leaving. Writes keep their bounded transport; their result may be uncertain.
  if (body === undefined) lifecycle?.addEventListener("abort", cancelRead, { once: true });
  const requireCurrent = () => {
    if (lifecycle?.aborted) throw new FollowupHttpError("CANCELLED");
    if (controller.signal.aborted) throw new FollowupHttpError("NETWORK");
  };
  try {
    requireCurrent();
    const response = await fetch(url, {
      cache: "no-store", signal: controller.signal,
      ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    requireCurrent();
    if (response.status === 401 || response.status === 403) window.location.replace("/client-login");
    if (!response.ok) throw new FollowupHttpError(response.status);
    try {
      const payload = await response.json();
      requireCurrent();
      return parse(payload.data);
    } catch (error) {
      if (error instanceof FollowupHttpError) throw error;
      throw new FollowupHttpError("RESPONSE");
    }
  } catch (error) {
    if (lifecycle?.aborted) throw new FollowupHttpError("CANCELLED");
    if (error instanceof FollowupHttpError) throw error;
    throw new FollowupHttpError("NETWORK");
  } finally { clearTimeout(timeout); lifecycle?.removeEventListener("abort", cancelRead); }
}
