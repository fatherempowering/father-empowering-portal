import { defineConfig } from "@playwright/test";
const port = process.env.FE_UX_PORT ?? "3016";
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error("Invalid isolated UI port");
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: ".",
  testMatch: ["m15-ui.spec.ts", "training-ui.spec.ts", "program-builder-ui.spec.ts", "program-publication-ui.spec.ts", "client-visual.spec.ts", "workout-results-ui.spec.ts", "exercise-pilot-ui.spec.ts", "pilot-program-builder-ui.spec.ts", "pilot-client-program-ui.spec.ts", "unified-exercise-picker-ui.spec.ts", "legacy-client-navigation-ui.spec.ts", "guided-workout-ui.spec.ts"],
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  outputDir: "../../test-results/m15-ui",
  webServer: {
    command: "node serve.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  use: {
    baseURL,
    browserName: "chromium",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
