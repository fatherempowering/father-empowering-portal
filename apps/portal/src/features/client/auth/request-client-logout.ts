type ClientLogoutTransport = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export async function requestClientLogout(
  onHttpResponse: (destination: "/login" | "/client-login") => void,
  transport: ClientLogoutTransport = fetch,
): Promise<boolean> {
  let response: Response;
  try {
    response = await transport("/api/v1/auth/client-logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
  } catch {
    return false;
  }

  let destination: "/login" | "/client-login" = "/client-login";
  try {
    const payload = await response.json();
    // Only local known routes may ever be used as a logout destination.
    if (response.ok && payload?.data?.redirectTo === "/login") destination = "/login";
  } catch { /* Preserve the fail-closed navigation on a non-JSON response. */ }
  onHttpResponse(destination);
  return true;
}
