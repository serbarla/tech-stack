import type {
  Auth as BetterAuth,
  BetterAuthOptions,
  BetterAuthPlugin,
} from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { DatabaseSync } from "node:sqlite";

import { SQLITE_PRAGMA_STATEMENTS } from "@acme/db";

// eslint-disable-next-line @typescript-eslint/require-await -- initAuth stays async per spec 13 (signature unchanged).
export async function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  baseUrl: string;
  databaseUrl: string;
  secret: string | undefined;
  trustedOrigins?: string[];
  extraPlugins?: TExtraPlugins;
}): Promise<Auth> {
  const database = new DatabaseSync(options.databaseUrl);
  for (const statement of SQLITE_PRAGMA_STATEMENTS) {
    database.exec(statement);
  }
  const config: BetterAuthOptions = {
    database,
    baseURL: options.baseUrl,
    secret: options.secret,
    plugins: [expo(), ...(options.extraPlugins ?? [])],
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: options.trustedOrigins ?? [
      "expo://",
      "http://localhost:3001",
    ],
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  };

  // Auth tables are created by packages/db migrations (pnpm db:migrate); run
  // them before boot, same contract as the post table. A fresh unmigrated DB
  // logs better-auth's "Database schema mismatch" until then.

  const auth = betterAuth(config);

  return auth;
}

export type Auth = BetterAuth<BetterAuthOptions>;
export type Session = Auth["$Infer"]["Session"];
