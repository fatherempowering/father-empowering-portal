type CoachLogoutTransport = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export async function requestCoachLogout(
  onHttpResponse: () => void,
  transport: CoachLogoutTransport = fetch,
): Promise<boolean> {
  try {
    await transport("/api/v1/auth/coach-logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
  } catch {
    return false;
  }

  onHttpResponse();
  return true;
}
