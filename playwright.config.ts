import { defineConfig, devices } from "@playwright/test";
const deployedURL = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 4,
  timeout: 30000,
  use: {
    baseURL: deployedURL || "http://127.0.0.1:5186",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: deployedURL
    ? undefined
    : {
        command: process.env.CI
          ? "npm run preview -- --port 5186 --strictPort"
          : "npm run dev -- --port 5186 --strictPort",
        url: "http://127.0.0.1:5186",
        reuseExistingServer: !process.env.CI,
      },
});
