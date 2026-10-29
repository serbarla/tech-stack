import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BetterAuthPlugin } from "better-auth";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import type { App } from "@acme/api";
import type { Orm } from "@acme/db";
import { createApp, resetRateLimit } from "@acme/api";
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

// Fixture created once in beforeAll and passed explicitly to the tests that
// need it — no test consumes another test's side effects (spec 27, obj. 1).
let ada: { email: string; password: string; cookie: string };

function request(path: string, init?: RequestInit) {
  return app.handle(new Request(BASE_URL + path, init));
}

function sessionCookie(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

  const email = uniqueEmail("ada");
  const password = "password1234";
  const res = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada", email, password }),
  });
  expect(res.ok).toBe(true);
  ada = { email, password, cookie: sessionCookie(res) };
});

// All /api/auth/* traffic shares one rate-limit bucket per process; give every
// test a fresh window (spec 27, obj. 2).
beforeEach(() => {
  resetRateLimit();
});

afterAll(async () => {
  // Guarded: a beforeAll failure leaves orm unset, and an unguarded
  // orm.close() TypeError would mask the real error (spec 27, obj. 1).
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  await orm?.close();
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
  const email = uniqueEmail("signup");
  const res = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada", email, password: "password1234" }),
  });
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { user: { email: string } };
  expect(body.user.email).toBe(email);
  const cookie = sessionCookie(res);
  expect(cookie).toContain("better-auth.session_token");

  const session = await request("/api/auth/get-session", {
    headers: { cookie },
  });
  expect(session.ok).toBe(true);
  const json = (await session.json()) as {
    data?: { user?: { email?: string } };
    user?: { email?: string };
  };
  expect(json.data?.user?.email ?? json.user?.email).toBe(email);
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
    headers: { "content-type": "application/json", cookie: ada.cookie },
    body: JSON.stringify({ title: "t", content: "c" }),
  });
  expect(res.ok).toBe(true);

  const list = await request("/api/posts", { headers: { cookie: ada.cookie } });
  const posts = (await list.json()) as { title: string }[];
  expect(posts.some((p) => p.title === "t")).toBe(true);
});

test("5. sign-in rejects the wrong password and accepts the right one", async (): Promise<void> => {
  const bad = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ada.email, password: "wrong-password" }),
  });
  expect(bad.ok).toBe(false);
  const badBody = (await bad.json()) as { code?: string };
  expect(badBody.code).toBe("INVALID_EMAIL_OR_PASSWORD");

  const good = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ada.email, password: ada.password }),
  });
  expect(good.ok).toBe(true);
  expect(sessionCookie(good)).toContain("better-auth.session_token");
});

test("6. duplicate sign-up is rejected", async (): Promise<void> => {
  // Seeds its own user so the case never depends on other tests' sign-ups.
  const email = uniqueEmail("dup");
  const first = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada", email, password: "password1234" }),
  });
  expect(first.ok).toBe(true);

  const res = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada", email, password: "password1234" }),
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
    headers: { ...ORIGIN, cookie: ada.cookie },
  });
  expect(res.ok).toBe(true);

  const after = await request("/api/auth/get-session", {
    headers: { cookie: ada.cookie },
  });
  const json = (await after.json()) as {
    data?: { user?: unknown };
    user?: unknown;
  } | null;
  expect(json?.data?.user ?? json?.user ?? null).toBeNull();
});

describe("posts API", () => {
  const POST_KEYS = ["content", "createdAt", "id", "title", "updatedAt"];
  let cookie = "";

  beforeAll(async () => {
    // Self-contained fixture: own user per run so no test consumes another's
    // side effects (spec 27 keeps this property).
    const res = await request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Poster",
        email: uniqueEmail("poster"),
        password: "password1234",
      }),
    });
    expect(res.ok).toBe(true);
    cookie = sessionCookie(res);
  });

  test("post lifecycle: create → detail keys → list keys → delete → empty list", async () => {
    // Precondition this test owns: an empty post table (test 4 and repeated
    // runs leave rows behind).
    await orm.em.getConnection().execute("delete from post");

    const created = await request("/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "hello", content: "world" }),
    });
    expect(created.ok).toBe(true);
    const post = (await created.json()) as { id: string };
    expect(Object.keys(post).sort()).toEqual(POST_KEYS);

    const detail = await request(`/api/posts/${post.id}`, {
      headers: { cookie },
    });
    expect(detail.ok).toBe(true);
    const detailJson = (await detail.json()) as object;
    expect(Object.keys(detailJson).sort()).toEqual(POST_KEYS);

    const list = await request("/api/posts", { headers: { cookie } });
    const rows = (await list.json()) as object[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(POST_KEYS);
    }

    const deleted = await request(`/api/posts/${post.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(deleted.ok).toBe(true);

    const after = await request("/api/posts", { headers: { cookie } });
    expect((await after.json()) as object[]).toHaveLength(0);
  });

  test("missing post returns 404 on GET and DELETE", async () => {
    const detail = await request("/api/posts/999999", { headers: { cookie } });
    expect(detail.status).toBe(404);
    expect(await detail.json()).toEqual({ error: "Post not found" });

    const deleted = await request("/api/posts/999999", {
      method: "DELETE",
      headers: { cookie },
    });
    expect(deleted.status).toBe(404);
    expect(await deleted.json()).toEqual({ error: "Post not found" });
  });
});

describe("hardening", () => {
  test("GET /healthz is a public liveness probe", async (): Promise<void> => {
    const res = await request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("security headers are applied to every response", async (): Promise<void> => {
    for (const path of ["/healthz", "/api/posts", "/api/auth/ok"]) {
      const res = await request(path);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin",
      );
    }
  });

  test("auth rate limit answers 429 after 60 requests per window", async (): Promise<void> => {
    const codes: number[] = [];
    for (let i = 0; i < 61; i++) {
      const res = await request("/api/auth/ok");
      codes.push(res.status);
      if (res.status === 429) {
        expect(await res.json()).toEqual({ error: "Too many requests" });
      }
    }
    expect(codes.slice(0, 60).every((c) => c === 200)).toBe(true);
    expect(codes[60]).toBe(429);
  });

  test("unauthenticated GET /api/posts returns an array", async (): Promise<void> => {
    const res = await request("/api/posts");
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
