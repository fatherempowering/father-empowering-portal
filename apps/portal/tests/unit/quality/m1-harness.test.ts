import { describe, expect, it } from "vitest";

import { currentTotp } from "../../harness/m1-local-supabase";
import { extractActivation, extractSixDigitOtp } from "../../harness/mailpit";

describe("M1 local quality harness", () => {
  it("génère les codes TOTP SHA-1 à six chiffres attendus", () => {
    const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    expect(currentTotp(rfcSecret, 59_000)).toBe("287082");
    expect(currentTotp(rfcSecret, 1_111_111_109_000)).toBe("081804");
  });

  it("réécrit une invitation vers l'application locale sans altérer le jeton", () => {
    const token = "m1-opaque-invitation-token-with-more-than-thirty-two-characters";
    const result = extractActivation("http://127.0.0.1:3000", {
      id: "mail-1",
      subject: "Invitation",
      text: `Ouvre https://app.fatherempowering.com/activate#token=${token}`,
      html: "",
    });

    expect(result.token).toBe(token);
    expect(result.url).toBe(`http://127.0.0.1:3000/activate#token=${token}`);
  });

  it("refuse un jeton d'invitation placé dans la query string", () => {
    expect(() =>
      extractActivation("http://127.0.0.1:3000", {
        id: "mail-query-token",
        subject: "Invitation",
        text: `Ouvre https://app.fatherempowering.com/activate?token=${"x".repeat(48)}`,
        html: "",
      }),
    ).toThrow(/must never be transported in a query string/i);
  });

  it("extrait seulement un OTP autonome à six chiffres", () => {
    expect(
      extractSixDigitOtp({
        id: "mail-2",
        subject: "Code",
        text: "Ton code est 123456.",
        html: "",
      }),
    ).toBe("123456");
  });
});
