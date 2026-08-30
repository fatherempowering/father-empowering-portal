import { afterEach, describe, expect, it, vi } from "vitest";

import { InvalidOriginError, requireSameOrigin } from "@/lib/http/origin";

const canonicalOrigin = "https://app.fatherempowering.com:8443";
const internalRequestUrl = "http://internal-next-server:3000/api/v1/coach/clients";

function requestWithOrigin(origin?: string, extraHeaders?: HeadersInit): Request {
  const headers = new Headers(extraHeaders);
  if (origin !== undefined) headers.set("origin", origin);
  return new Request(internalRequestUrl, { method: "POST", headers });
}

describe("requireSameOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the exact configured origin after normalizing the application URL", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_APP_URL",
      `${canonicalOrigin}/configured/path?ignored=true#ignored`,
    );

    expect(() => requireSameOrigin(requestWithOrigin(canonicalOrigin))).not.toThrow();
  });

  it("rejects a missing Origin header", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", canonicalOrigin);

    expect(() => requireSameOrigin(requestWithOrigin())).toThrow(InvalidOriginError);
  });

  it("rejects a different origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", canonicalOrigin);

    expect(() => requireSameOrigin(requestWithOrigin("https://evil.example"))).toThrow(
      InvalidOriginError,
    );
  });

  it.each(["not-an-origin", "null", `${canonicalOrigin}/unexpected-path`])(
    "rejects the malformed Origin value %s",
    (origin) => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", canonicalOrigin);

      expect(() => requireSameOrigin(requestWithOrigin(origin))).toThrow(InvalidOriginError);
    },
  );

  it.each([undefined, "", "not-a-url", "file:///tmp/portal"])(
    "rejects the missing or invalid canonical configuration %s",
    (configuredUrl) => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", configuredUrl);

      expect(() => requireSameOrigin(requestWithOrigin(canonicalOrigin))).toThrow(
        InvalidOriginError,
      );
    },
  );

  it("rejects a different port", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", canonicalOrigin);

    expect(() =>
      requireSameOrigin(requestWithOrigin("https://app.fatherempowering.com:9443")),
    ).toThrow(InvalidOriginError);
  });

  it("rejects a different protocol", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", canonicalOrigin);

    expect(() =>
      requireSameOrigin(requestWithOrigin("http://app.fatherempowering.com:8443")),
    ).toThrow(InvalidOriginError);
  });

  it("never trusts Host or forwarding headers as an origin authority", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", canonicalOrigin);
    const headersClaimingCanonicalOrigin = {
      host: "app.fatherempowering.com:8443",
      forwarded: "host=app.fatherempowering.com:8443;proto=https",
      "x-forwarded-host": "app.fatherempowering.com:8443",
      "x-forwarded-proto": "https",
    };
    const headersClaimingForeignOrigin = {
      host: "evil.example",
      forwarded: "host=evil.example;proto=http",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    };

    expect(() =>
      requireSameOrigin(requestWithOrigin("https://evil.example", headersClaimingCanonicalOrigin)),
    ).toThrow(InvalidOriginError);
    expect(() =>
      requireSameOrigin(requestWithOrigin(canonicalOrigin, headersClaimingForeignOrigin)),
    ).not.toThrow();
  });
});
