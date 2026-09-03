import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const baseURL = process.env.M1_APP_URL ?? "http://127.0.0.1:3000";
// `pnpm --filter ... exec` runs Playwright from apps/portal. Avoid import.meta
// so the config remains loadable under Playwright's current CommonJS loader.
const repositoryRoot = resolve(process.cwd(), "../..");
const parsed = new URL(baseURL);
if (
  parsed.protocol !== "http:" ||
  parsed.hostname !== "127.0.0.1" ||
  parsed.port !== "3000" ||
  parsed.username !== "" ||
  parsed.password !== "" ||
  parsed.pathname !== "/" ||
  parsed.search !== "" ||
  parsed.hash !== ""
) {
  throw new Error("BLOCKED: M1 Playwright baseURL must be the canonical loopback origin.");
}

export default defineConfig({
  testDir: ".",
  testMatch: "m1-vertical.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: resolve(repositoryRoot, "test-results/m1-e2e"),
  reporter: [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
    ...devices["Desktop Chrome"],
    // This flow handles bearer invitation secrets and OTPs. Playwright traces,
    // screenshots, videos and HTML step reports can serialize those values.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
