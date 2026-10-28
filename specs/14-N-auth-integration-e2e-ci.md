# Spec 14 — Phase N: Integration + e2e tests and CI

- Source: `BETTER_AUTH_EMAIL_PASSWORD_PLAN.md` → `### Phase 4`.
- Depends on: specs 11–13 (email & password flows over migration-owned auth tables), spec 05 (`/api/auth/ok` health endpoint; web `CreatePostForm`/`.post-list` selectors), spec 08 (CI + the shared `./tooling/github/setup` that installs pnpm, node, and bun).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: `apps/server/test/auth-flow.test.ts` (7-case `bun:test` HTTP integration suite against the real app on a throwaway DB) and `apps/web/e2e/auth.spec.ts` (Playwright chromium, 2 tests) pass and run in CI via the new `test`/`e2e` jobs; `apps/server` gains `"test": "bun test"`, `test` in tsconfig `include`, and an eslint `test/**` override; `@acme/web` gains `@playwright/test`, an `"e2e"` script, and `playwright.config.ts` (two webServers: migrate + server on `3000` against a fresh `data/e2e.db` per run, web on `3001`).

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [ ] 1. Wire the `bun test` harness in `apps/server` — requirements: `apps/server/package.json` gains `"test": "bun test"`; `apps/server/tsconfig.json` `include` (currently `["src", "env.d.ts"]`) gains `"test"` so the suite is typechecked; `apps/server/eslint.config.ts` appends a config block `{ files: ["test/**"], rules: { "no-restricted-properties": "off" } }` (the `restrictEnvAccess` rule forbids `process.env`, which the test bootstrap needs); contingency: if lint still flags `process.env` inside `apps/server/test/**` despite the override, replace the override with a single `// eslint-disable-next-line no-restricted-properties` on the assignment line — behavior unchanged; commands: `pnpm nx run @acme/server:typecheck`

- [ ] 2. Write the integration suite `apps/server/test/auth-flow.test.ts` (uses `bun:test`; `@types/bun` is already in `apps/server` devDeps) — requirements: `beforeAll` sets `process.env.DATABASE_URL` to a fresh throwaway path (`join(mkdtempSync(join(tmpdir(), "acme-auth-test-")), "test.db")`), runs the real migration command `Bun.spawnSync(["pnpm", "db:migrate"], { cwd: <workspace root = new URL("../../..", import.meta.url)>, env: { ...process.env, DATABASE_URL: <same path> }, stdout: "inherit", stderr: "inherit" })` and asserts `exitCode === 0` (varlock passes explicit env through — verified; `migration:up` is `cache: false` in `nx.json` — verified), then `initDb()` (from `@acme/db`), `initAuth<BetterAuthPlugin[]>({ baseUrl: "http://localhost:3000", databaseUrl: getDatabasePath(), secret: "test-secret" })` (the frozen explicit type argument of spec 05 divergence 1 — a plain `initAuth({...})` does not typecheck against `createApp`'s `auth: Auth` parameter), and `createApp({ auth, orm })`; `afterAll` closes the ORM (`orm.close()`); the request helper is `app.handle(new Request("http://localhost:3000" + path, init))` — no socket listen, Playwright covers the wire; the cookie helper extracts `set-cookie` via `res.headers.getSetCookie().map(c => c.split(";")[0]).join("; ")` and replays it as a `cookie` request header; fresh DB in `beforeAll`, one shared user per case where noted; test cases:
  1. **schema** — `orm.em.getConnection().execute("select name from sqlite_master where type = 'table'")` includes `user`, `session`, `account`, `verification`, `post`.
  2. **sign-up creates a session** — `POST /api/auth/sign-up/email` JSON `{"name":"Ada","email":"ada@example.com","password":"password1234"}` → `res.ok`; body `user.email === "ada@example.com"`; `set-cookie` contains `better-auth.session_token`; `GET /api/auth/get-session` with that cookie → `res.ok` and body user email matches.
  3. **protected route rejects anonymous** — `POST /api/posts` JSON `{"title":"t","content":"c"}` without cookie → status `401` (the `authed` macro's `status(401)` — repo-owned).
  4. **protected route accepts session** — the same request with the sign-up cookie → `res.ok`; `GET /api/posts` includes the row.
  5. **sign-in** — `POST /api/auth/sign-in/email` with wrong password → `res.ok === false` and body `code === "INVALID_EMAIL_OR_PASSWORD"`; with correct password → `res.ok` and a `better-auth.session_token` cookie.
  6. **duplicate sign-up** — sign up again with `ada@example.com` → `res.ok === false` and body `code === "USER_ALREADY_EXISTS"`.
  7. **sign-out** — `POST /api/auth/sign-out` with the cookie → `res.ok`; `GET /api/auth/get-session` afterwards has no user (`expect(json?.user ?? json?.data?.user ?? null).toBeNull()`).
  commands: `pnpm --filter @acme/server test`

- [ ] 3. Wire Playwright into `@acme/web` — requirements: `pnpm --filter @acme/web add -D @playwright/test` (resolves current 1.x; single consumer — no catalog entry) and add `"e2e": "playwright test"` to `apps/web/package.json`; new `apps/web/playwright.config.ts` with exactly:
  ```ts
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
        env: { ...process.env, DATABASE_URL: "data/e2e.db" },
        timeout: 120_000,
      },
      {
        command: "pnpm --filter @acme/web dev",
        cwd: "../..",
        url: "http://localhost:3001",
      },
    ],
  });
  ```
  (`getDatabasePath()` resolves the relative `DATABASE_URL` against the workspace root regardless of cwd; `data/` is gitignored; `/api/auth/ok` is the proven auth health endpoint from spec 05; a fresh DB each run makes the fixed fixture emails deterministic; `webServer` sequencing is order-independent — the migration happens inside the server's command chain); contingency: if `pnpm nx run @acme/web:check` (CI `check-web`) rejects the new `e2e/**`/`playwright.config.ts` files, exclude those paths in the tool that complains (tsconfig `exclude` or eslint ignores) — one line — then re-run; commands: `pnpm --filter @acme/web add -D @playwright/test`

- [ ] 4. Write the Playwright spec `apps/web/e2e/auth.spec.ts` — requirements: two tests whose selectors match spec 12's form contract exactly:
  1. `sign up, create a post, sign out` — `page.goto("/")` → click `getByRole("button", { name: "Need an account? Sign up" })` → fill `getByLabel("Name")` = `E2E User`, `getByLabel("Email")` = `e2e-1@example.com`, `getByLabel("Password")` = `password1234` → click `getByRole("button", { name: "Sign up", exact: true })` → expect `getByText(/Signed in as/)`. Then fill `getByLabel("Title")` = `Hello e2e`, `getByLabel("Content")` = `created by playwright` → click `getByRole("button", { name: "Create" })` → expect `.post-list` to contain `Hello e2e`. Then click `getByRole("button", { name: "Sign out" })` → expect `getByRole("button", { name: "Need an account? Sign up" })` visible and `getByRole("button", { name: "Create" })` hidden (the create form is gated on session).
  2. `sign in rejects a wrong password and accepts the right one` — `page.goto("/")` → click `Need an account? Sign up` → sign up `e2e-2@example.com` / `password1234` → `Sign out` (success resets mode to signin, so the sign-in form is showing) → fill `e2e-2@example.com` + `wrong-password` → click `getByRole("button", { name: "Sign in", exact: true })` → expect `.form-error` visible with text matching `/invalid/i`; then fill `password1234` → click `Sign in` → expect `getByText(/Signed in as/)`.
  commands: `pnpm --filter @acme/web e2e`

- [ ] 5. Append the two CI jobs to `.github/workflows/ci.yml` — requirements: the shared `./tooling/github/setup` already installs pnpm, node, and bun (verified); append exactly:
  ```yaml
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v5
        - name: Setup
          uses: ./tooling/github/setup
        - name: Integration tests
          run: pnpm --filter @acme/server test

    e2e:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v5
        - name: Setup
          uses: ./tooling/github/setup
        - name: Install Playwright browser
          run: pnpm exec playwright install --with-deps chromium
          working-directory: apps/web
        - name: Web e2e
          run: pnpm --filter @acme/web e2e
  ```
  commands: `grep -n "Integration tests\|Web e2e" .github/workflows/ci.yml`

## 2. No-go

- Do not write unit tests — `bun test` here is the HTTP integration suite; per-function/unit tests stay out (AGENTS.md: e2e and integration are the priorities).
- Do not listen on a socket in the integration suite (`app.handle` only — Playwright covers the wire) and do not mock the app, DB, or auth.
- Do not change the spec 12 form contract (labels/button names), better-auth config, or app behavior to fit the tests — a failing case is a bug fixed inside the owning spec's objectives (AGENTS.md bug-fixing rule) or a divergence to record, never a rewritten expectation.
- Do not add `@playwright/test` to the pnpm catalog or to any package other than `@acme/web`; do not run Expo in CI (its smoke stays manual, spec 12).
- Do not commit `data/e2e.db*`, Playwright output (`test-results/`, `playwright-report/`), or any generated test artifact.

## 3. Testing criteria

*All boxes checked = spec done.*

- [ ] `pnpm lint && pnpm format && pnpm typecheck` exit 0 (repo root) — plan Verification 7 (the new test files are covered by `apps/server`'s tsconfig `include`; the e2e/config files typecheck under `apps/web`'s unrestricted tsconfig).
- [ ] Integration suite (plan Verification 3): `pnpm --filter @acme/server test` → all seven cases pass (schema tables, sign-up→session→create post, 401 anonymous, sign-in wrong/right password, duplicate sign-up, sign-out). This is the regression test to keep.
- [ ] Web e2e (plan Verification 4): after `cd apps/web && pnpm exec playwright install chromium`, `pnpm --filter @acme/web e2e` → 2 tests pass (sign-up → create post → sign-out hides the form; wrong password rejected, right password signed in).
- [ ] objective 5: `.github/workflows/ci.yml` contains the `test` and `e2e` jobs exactly as specified (both `uses: ./tooling/github/setup`).
- [ ] every objective in section 1 is checked (divergences, if any, appended here).

## 4. Divergences

*REQUIRED at the end of every spec. If reality diverged from this spec while
executing it, append a numbered entry here — do not silently drop it and do not
edit the objectives to match what you actually did. Each entry: what diverged,
why, the fix attempt(s), and (if unresolved) a pointer to a tracking file. Keep
the `- [ ]` testing-criteria box unchecked and note the divergence inline next
to it, exactly as in `specs/02-B-database-drizzle-to-mikroorm-kysely.md`.*

- [ ] every divergence found is appended below (or the section reads "None.")

*Format (one numbered item per divergence):*

1. <what diverged and its current state> — <why it could not be done as
   written, citing the No-go rule or spec that blocks it> (Verified <date>:
   <N> fix attempts — <attempt 1>, <attempt 2>, <attempt 3> — all fenced by
   <constraint>; <impact> is deferred to <later spec> by design, not a defect.)

### Divergences

None.

### Unresolved divergences → `specs/divergencies/`

*A divergence that stays OPEN because a later spec owns the fix MUST also get a
tracking file in `specs/divergencies/`, so future agents can find and clear it.
Name it `<spec-id>-<short-slug>.md` (e.g.
`02-B-api-typecheck-lint-red.md`). Include: source spec + the exact criteria it
blocks, what is broken (files/imports), why each fix attempt was fenced, and a
"how to clear it" checklist naming the spec that resolves it plus the commands
to re-verify. Then link the tracking file from the matching Divergence entry
above (e.g. "**Tracked for future check-up in
`specs/divergencies/<file>.md`**"). When the later spec lands and the checks
pass, mark the criteria `[x]` and remove the tracking file.*
