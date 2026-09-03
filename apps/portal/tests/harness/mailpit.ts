export type CapturedMail = Readonly<{
  id: string;
  subject: string;
  text: string;
  html: string;
}>;

type MailpitSummary = {
  ID?: string;
  Subject?: string;
};

type MailpitSearch = {
  messages?: MailpitSummary[];
};

type MailpitMessage = {
  ID?: string;
  Subject?: string;
  Text?: string;
  HTML?: string;
};

export async function waitForMail(
  mailpitUrl: string,
  recipient: string,
  predicate: (message: CapturedMail) => boolean,
  options: { excludeIds?: ReadonlySet<string>; timeoutMs?: number } = {},
): Promise<CapturedMail> {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  const query = encodeURIComponent(`to:${recipient}`);

  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitUrl}/api/v1/search?query=${query}`);
    if (!response.ok) throw new Error(`Mailpit search failed with ${response.status}`);
    const search = (await response.json()) as MailpitSearch;

    for (const summary of search.messages ?? []) {
      const id = summary.ID;
      if (!id || options.excludeIds?.has(id)) continue;
      const detailResponse = await fetch(
        `${mailpitUrl}/api/v1/message/${encodeURIComponent(id)}`,
      );
      if (!detailResponse.ok) continue;
      const detail = (await detailResponse.json()) as MailpitMessage;
      const message = {
        id,
        subject: detail.Subject ?? summary.Subject ?? "",
        text: detail.Text ?? "",
        html: detail.HTML ?? "",
      };
      if (predicate(message)) return message;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No matching local Mailpit message received for ${recipient}`);
}

export function extractActivation(environmentAppUrl: string, message: CapturedMail) {
  const content = `${message.text}\n${message.html}`.replaceAll("&amp;", "&");
  const match = content.match(
    /https?:\/\/[^\s"'<>]+\/activate(?:[?#][^\s"'<>]*)?/i,
  );
  if (!match) throw new Error("Invitation email does not contain an activation URL");

  const received = new URL(match[0]);
  if (received.pathname !== "/activate") {
    throw new Error("Invitation email activation URL has an unexpected path");
  }
  if (received.search) {
    throw new Error("Invitation token must never be transported in a query string");
  }
  const token = new URLSearchParams(received.hash.slice(1)).get("token");
  if (!token || token.length < 32) {
    throw new Error("Invitation email activation URL has no high-entropy token");
  }

  const local = new URL("/activate", environmentAppUrl);
  local.hash = new URLSearchParams({ token }).toString();
  return { url: local.toString(), token };
}

export function extractSixDigitOtp(message: CapturedMail): string {
  const content = `${message.subject}\n${message.text}\n${message.html}`;
  const match = content.match(/(?:^|\D)(\d{6})(?:\D|$)/);
  if (!match?.[1]) throw new Error("Auth email does not contain a six-digit OTP");
  return match[1];
}
