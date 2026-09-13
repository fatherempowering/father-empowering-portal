import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CookieMutation = Readonly<{
  name: string;
  value: string;
  options: Readonly<{
    path: string;
    sameSite: "lax";
    httpOnly: boolean;
  }>;
}>;

type CookieAdapter = Readonly<{
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: CookieMutation[]): void;
}>;

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/env", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  }),
}));

import { refreshSupabaseSession } from "@/lib/supabase/middleware";

describe("Supabase middleware session rotation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createServerClient.mockImplementation(
      (_url: string, _key: string, options: { cookies: CookieAdapter }) => ({
        auth: {
          getUser: async () => {
            options.cookies.setAll([
              {
                name: "m1-session-cookie",
                value: "rotation-after",
                options: { path: "/", sameSite: "lax", httpOnly: true },
              },
            ]);
            return mocks.getUser();
          },
        },
      }),
    );
    mocks.getUser.mockResolvedValue({ data: { user: { id: "client-test-id" } }, error: null });
  });

  it("propagates a cookie rotated by getUser to the request and response", async () => {
    const request = new NextRequest("https://app.fatherempowering.com/client", {
      headers: { cookie: "m1-session-cookie=rotation-before" },
    });

    const response = await refreshSupabaseSession(request);

    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(request.cookies.get("m1-session-cookie")?.value).toBe("rotation-after");
    expect(response.cookies.get("m1-session-cookie")).toMatchObject({
      value: "rotation-after",
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  });
});
