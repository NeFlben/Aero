import { defineConfig } from "@playwright/test";

/** Uses the installed Chrome and a throwaway database, so the local data stays untouched. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  use: { baseURL: "http://localhost:3217", channel: "chrome", screenshot: "only-on-failure", actionTimeout: 15_000 },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 3217",
    url: "http://localhost:3217/login",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { PGLITE_DATA_DIR: ".data/e2e-pg", UPLOAD_DIR: ".data/e2e-uploads", BETTER_AUTH_URL: "http://localhost:3217", HANGAR_AUTH: "on" },
  },
});

