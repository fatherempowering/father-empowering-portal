type CoachLogoutTransport = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export async function requestCoachLogout(
  onHttpResponse: () => void,
  transport: CoachLogoutTransport = fetch,
): Promise<boolean> {
  try {
    const response = await transport("/api/v1/auth/coach-logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!response.ok) return false;
  } catch {
    return false;
  }

  onHttpResponse();
  return true;
}
