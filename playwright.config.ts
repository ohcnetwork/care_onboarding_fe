import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: { baseURL: "http://127.0.0.1:4179", headless: true, trace: "retain-on-failure" },
  webServer: [
    { command: "npm run preview", url: process.env.ONBOARDING_REMOTE_URL ?? "http://127.0.0.1:4178/assets/remoteEntry.js", reuseExistingServer: !process.env.CI },
    { command: "cd tests/harness && npx vite --config vite.config.ts", url: "http://127.0.0.1:4179", reuseExistingServer: !process.env.CI },
  ],
});
