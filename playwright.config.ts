import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/ui",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
