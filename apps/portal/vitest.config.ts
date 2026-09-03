import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["tests/integration/**", "tests/e2e/**", "node_modules/**"],
    coverage: { reporter: ["text", "json", "html"] },
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
