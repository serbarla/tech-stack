import "varlock/auto-load";

import type { BetterAuthPlugin } from "better-auth";
import { ENV } from "varlock/env";

import { createApp } from "@acme/api";
import { initAuth } from "@acme/auth";
import { getDatabasePath, initDb } from "@acme/db";

// Production must never boot on the dev placeholder secret (spec 20, obj. 6).
if (
  Bun.env.NODE_ENV === "production" &&
  (!ENV.AUTH_SECRET || ENV.AUTH_SECRET === "local-dev-placeholder-not-for-prod")
) {
  console.error(
    "AUTH_SECRET is unset or still set to the local-dev placeholder; refusing to start in production.",
  );
  process.exit(1);
}

const orm = await initDb();
const auth = await initAuth<BetterAuthPlugin[]>({
  baseUrl: ENV.BETTER_AUTH_URL,
  databaseUrl: getDatabasePath(),
  secret: ENV.AUTH_SECRET,
});

createApp({ auth, orm }).listen(ENV.PORT, () => {
  console.log(`🦊 Elysia running at http://localhost:${ENV.PORT}`);
});
