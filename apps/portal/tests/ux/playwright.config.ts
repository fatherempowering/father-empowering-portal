import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: ["m15-ui.spec.ts", "training-ui.spec.ts", "program-builder-ui.spec.ts", "program-publication-ui.spec.ts", "client-visual.spec.ts"],
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  outputDir: "../../test-results/m15-ui",
  webServer: {
    command: "node serve.mjs",
    url: "http://127.0.0.1:3016",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  use: {
    baseURL: "http://127.0.0.1:3016",
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
