import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";

process.env.DITELE_E2E_RUN_ID ??= randomUUID();

const baseURL = process.env.DITELE_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const useProductionServer = Boolean(process.env.CI) || process.env.DITELE_E2E_PRODUCTION === "1";
const serverUrl = new URL(baseURL);
const serverPort =
  serverUrl.port || (serverUrl.protocol === "https:" ? "443" : "80");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 1000 } } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } }
  ],
  webServer: {
    command: useProductionServer ? "npm run build && npm run start" : "npm run dev",
    env: {
      ...process.env,
      DITELE_APP_ORIGIN: serverUrl.origin,
      PORT: serverPort,
    },
    url: new URL("/en", serverUrl).toString(),
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
