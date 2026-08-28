import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const baseURL = process.env.M1_APP_URL ?? "http://127.0.0.1:3000";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const parsed = new URL(baseURL);
if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
  throw new Error(`BLOCKED: M1 Playwright baseURL must be loopback, received ${baseURL}`);
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
