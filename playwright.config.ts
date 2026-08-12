import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/artifacts",
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3010",
    url: "http://127.0.0.1:3010",
    env: {
      PROVIDER_MODE: "mock",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: "",
      GOOGLE_MAPS_SERVER_KEY: "",
    },
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
