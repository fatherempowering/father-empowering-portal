import { describe, expect, it } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

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

  it("verrouille localement le template OTP et TOTP requis par le parcours", () => {
    const config = readFileSync(
      new URL("../../../supabase/config.toml", import.meta.url),
      "utf8",
    );
    const template = readFileSync(
      new URL("../../../supabase/templates/magic-link-otp.html", import.meta.url),
      "utf8",
    );

    expect(config).toMatch(/\[auth\.email\.template\.magic_link\][\s\S]*content_path\s*=\s*"\.\/supabase\/templates\/magic-link-otp\.html"/);
    expect(config).toMatch(/\[auth\.mfa\.totp\][\s\S]*enroll_enabled\s*=\s*true[\s\S]*verify_enabled\s*=\s*true/);
    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
  });

  it("expose le SMTP Mailpit uniquement sur les ports locaux attendus", () => {
    const config = readFileSync(
      new URL("../../../supabase/config.toml", import.meta.url),
      "utf8",
    );

    expect(config).toMatch(
      /\[local_smtp\]\s+enabled\s*=\s*true\s+port\s*=\s*54324\s+smtp_port\s*=\s*54325/,
    );
  });

  it("ne journalise jamais la sortie sensible d'un statut Supabase en échec", () => {
    const fixture = mkdtempSync(join(tmpdir(), "m1-supabase-status-"));
    const fakePnpm = join(fixture, "pnpm");
    const output = join(fixture, "supabase.env");
    const secret = "sb_secret_m1-must-never-reach-ci-logs";

    try {
      writeFileSync(
        fakePnpm,
        `#!/bin/sh\nprintf '%s\\n' '{"SERVICE_ROLE_KEY":"${secret}"}'\nexit 1\n`,
      );
      chmodSync(fakePnpm, 0o700);

      const helper = resolve(
        new URL("../../../../../scripts/m1-supabase-env.mjs", import.meta.url)
          .pathname,
      );
      const result = spawnSync(process.execPath, [helper, output], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${fixture}${delimiter}${process.env.PATH ?? ""}`,
          SUPABASE_WORKDIR: fixture,
        },
      });
      const logs = `${result.stdout}${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(logs).toContain("Unable to read local Supabase status safely");
      expect(logs).not.toContain(secret);
      expect(logs).not.toContain("SERVICE_ROLE_KEY");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
