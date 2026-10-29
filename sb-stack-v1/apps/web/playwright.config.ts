import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3001" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command:
        "rm -f data/e2e.db data/e2e.db-shm data/e2e.db-wal && pnpm db:migrate && pnpm --filter @acme/server start",
      cwd: "../..",
      url: "http://localhost:3000/api/auth/ok",
      // Explicit overrides keep a developer's exported PORT/VITE_API_URL/
      // DATABASE_URL (or NODE_ENV=production, which trips the boot guard) from
      // breaking the e2e run; {...process.env} keeps PATH/HOME.
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: "3000",
        VITE_API_URL: "http://localhost:3000",
        DATABASE_URL: "data/e2e.db",
      },
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @acme/web dev",
      cwd: "../..",
      url: "http://localhost:3001",
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: "3000",
        VITE_API_URL: "http://localhost:3000",
      },
    },
  ],
});
