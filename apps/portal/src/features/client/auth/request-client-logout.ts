type ClientLogoutTransport = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export async function requestClientLogout(
  onHttpResponse: () => void,
  transport: ClientLogoutTransport = fetch,
): Promise<boolean> {
  try {
    await transport("/api/v1/auth/client-logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
  } catch {
    return false;
  }

  onHttpResponse();
  return true;
}
