import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BetterAuthPlugin } from "better-auth";
import { afterAll, beforeAll, expect, test } from "bun:test";

import type { App } from "@acme/api";
import type { Orm } from "@acme/db";
import { createApp } from "@acme/api";
import { initAuth } from "@acme/auth";
import { getDatabasePath, initDb } from "@acme/db";

const dbPath = join(mkdtempSync(join(tmpdir(), "acme-auth-test-")), "test.db");
process.env.DATABASE_URL = dbPath;

const BASE_URL = "http://localhost:3000";
// better-auth's origin/CSRF middleware rejects cookie-bearing POSTs without a
// trusted Origin (spec 12 divergence 2); browsers always send it.
const ORIGIN = { origin: "http://localhost:3001" };

let app: App;
let orm: Orm;
let adaCookie = "";

function request(path: string, init?: RequestInit) {
  return app.handle(new Request(BASE_URL + path, init));
}

beforeAll(async () => {
  const migrate = Bun.spawnSync(["pnpm", "db:migrate"], {
    // Bun 1.4.4 stringifies a URL cwd to an invalid "file://…" path.
    cwd: fileURLToPath(new URL("../../..", import.meta.url)),
    env: { ...process.env, DATABASE_URL: dbPath },
    stdout: "inherit",
    stderr: "inherit",
  });
  expect(migrate.exitCode).toBe(0);

  orm = await initDb();
  const auth = await initAuth<BetterAuthPlugin[]>({
    baseUrl: BASE_URL,
    databaseUrl: getDatabasePath(),
    secret: "test-secret",
  });
  app = createApp({ auth, orm });
});

afterAll(async () => {
  await orm.close();
});

test("1. schema has the auth and post tables", async (): Promise<void> => {
  const rows = await orm.em
    .getConnection()
    .execute("select name from sqlite_master where type = 'table'");
  for (const table of ["user", "session", "account", "verification", "post"]) {
    expect(rows.some((r) => r.name === table)).toBe(true);
  }
});

test("2. sign-up creates a session", async (): Promise<void> => {
  const res = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ada",
      email: "ada@example.com",
      password: "password1234",
    }),
  });
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { user: { email: string } };
  expect(body.user.email).toBe("ada@example.com");
  adaCookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  expect(adaCookie).toContain("better-auth.session_token");

  const session = await request("/api/auth/get-session", {
    headers: { cookie: adaCookie },
  });
  expect(session.ok).toBe(true);
  const json = (await session.json()) as {
    data?: { user?: { email?: string } };
    user?: { email?: string };
  };
  expect(json.data?.user?.email ?? json.user?.email).toBe("ada@example.com");
});

test("3. protected route rejects anonymous", async (): Promise<void> => {
  const res = await request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "t", content: "c" }),
  });
  expect(res.status).toBe(401);
});

test("4. protected route accepts the session cookie", async (): Promise<void> => {
  const res = await request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adaCookie },
    body: JSON.stringify({ title: "t", content: "c" }),
  });
  expect(res.ok).toBe(true);

  const list = await request("/api/posts", { headers: { cookie: adaCookie } });
  const posts = (await list.json()) as { title: string }[];
  expect(posts.some((p) => p.title === "t")).toBe(true);
});

test("5. sign-in rejects the wrong password and accepts the right one", async (): Promise<void> => {
  const bad = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "ada@example.com",
      password: "wrong-password",
    }),
  });
  expect(bad.ok).toBe(false);
  const badBody = (await bad.json()) as { code?: string };
  expect(badBody.code).toBe("INVALID_EMAIL_OR_PASSWORD");

  const good = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "ada@example.com",
      password: "password1234",
    }),
  });
  expect(good.ok).toBe(true);
  expect(
    good.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  ).toContain("better-auth.session_token");
});

test("6. duplicate sign-up is rejected", async (): Promise<void> => {
  const res = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ada",
      email: "ada@example.com",
      password: "password1234",
    }),
  });
  expect(res.ok).toBe(false);
  const body = (await res.json()) as { code?: string };
  // better-auth 1.7.12's real code; the spec-literal USER_ALREADY_EXISTS is
  // from older docs (divergence 1).
  expect(body.code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
});

test("7. sign-out clears the session", async (): Promise<void> => {
  const res = await request("/api/auth/sign-out", {
    method: "POST",
    headers: { ...ORIGIN, cookie: adaCookie },
  });
  expect(res.ok).toBe(true);

  const after = await request("/api/auth/get-session", {
    headers: { cookie: adaCookie },
  });
  const json = (await after.json()) as {
    data?: { user?: unknown };
    user?: unknown;
  } | null;
  expect(json?.data?.user ?? json?.user ?? null).toBeNull();
});
