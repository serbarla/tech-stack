# Add better-auth email & password to web + Expo; remove Discord; own auth tables via migrations; integration + e2e tests

Repo root: `sb-stack-v1/` unless stated. All paths/commands relative to it.
Installed: better-auth 1.7.12 (pnpm, resolvable from `packages/auth/node_modules`), bun 1.4.4, MikroORM 7 (`@mikro-orm/sql`), Elysia + Eden Treaty, Solid 2 RC (web), Expo SDK 58 (expo). DB file: `data/sqlite.db` via `getDatabasePath()` (`packages/db/src/db-path.ts`).

## Context

Replace Discord OAuth with better-auth's built-in email & password (https://better-auth.com/docs/authentication/email-password) in `apps/web` and `apps/expo`. Discord is removed first and completely. The four better-auth tables (`user`, `session`, `account`, `verification`) move from better-auth's boot-time auto-migration (`getMigrations(...).runMigrations()` in `packages/auth/src/index.ts`) into a MikroORM migration so `pnpm db:migrate` builds the entire schema. Scope is core flows only: sign-up, sign-in, sign-out, session — no password reset, no email verification (no email provider exists; better-auth default `requireEmailVerification: false` applies). Testing last: a `bun test` HTTP integration suite against the real app on a throwaway DB, plus a Playwright browser e2e of the web sign-up/sign-in/create-post flow, both wired into `.github/workflows/ci.yml`. Expo is verified by manual smoke (no simulator in CI).

## Approach

Ordered phases. Each phase leaves the workspace typechecking and the stack bootable. Phase 1 = "remove Discord first"; phases 3–4 = "db tables and testing at the end". Phase 2 must precede phase 3: the migration SQL is captured from the final auth config (with `emailAndPassword` enabled).

### Phase 1 — Remove Discord completely

1. **`packages/auth/src/index.ts` — strip Discord and the OAuth plumbing.**
   - Delete the `oAuthProxy` import (`better-auth/plugins`) and its `plugins` entry — its only purpose was cross-origin OAuth callback proxying. `plugins` becomes `[expo(), ...(options.extraPlugins ?? [])]`.
   - Delete the whole `socialProviders: { discord: {...} }` block.
   - Delete options `discordClientId`, `discordClientSecret` **and** `productionUrl` from the `initAuth` options type — `productionUrl`'s only consumers were `oAuthProxy({ productionURL })` and the Discord `redirectURI`; nothing else reads it. Final options: `{ baseUrl: string; productionUrl removed; databaseUrl: string; secret: string | undefined; extraPlugins?: TExtraPlugins }`. Keep `initAuth` `async` returning `Promise<Auth>` (call shape `initAuth<BetterAuthPlugin[]>({...})` frozen for the server since spec 05 divergence 1; don't change `Auth`/`Session` exports).
   - Sole caller is `apps/server/src/index.ts` (verified by grep this session) — updated in step 2.
2. **`apps/server/src/index.ts`** — drop the `productionUrl`, `discordClientId`, `discordClientSecret` lines from the `initAuth` call. Result:
   ```ts
   const auth = await initAuth<BetterAuthPlugin[]>({
     baseUrl: ENV.BETTER_AUTH_URL,
     databaseUrl: getDatabasePath(),
     secret: ENV.AUTH_SECRET,
   });
   ```
3. **Env schema cutover.**
   - Root `.env.schema`: delete the `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET` entries — their two comment lines, their two `# @type=...` annotation lines, and the two value lines (currently at the file's tail, after `AUTH_SECRET`).
   - `apps/server/.env.schema` line 1: pick list becomes `# @import(../../, pick=[DATABASE_URL, BETTER_AUTH_URL, PORT, AUTH_SECRET])`.
   - Regenerate the generated types: `pnpm exec varlock codegen --path apps/server` → `apps/server/env.d.ts` no longer declares `AUTH_DISCORD_ID`/`AUTH_DISCORD_SECRET` (file is machine-generated; do not hand-edit).
   - Local `.env` may still contain the two keys. Harmless; delete the two lines only if `pnpm env:validate` complains (varlock resolves strictly from schema — unverified for stray keys).
4. **Web UI: delete the Discord entry point.** `apps/web/src/routes/index.tsx`, `AuthShowcase`: delete the `signIn` function and the fallback button block, leaving the fallback empty for now (`fallback={null}`); keep `signOut` and the signed-in block untouched. Phase 2 replaces the fallback with the email/password form.
5. **Expo UI: delete the Discord entry point.** `apps/expo/src/app/index.tsx`, `MobileAuth`: remove the `authClient.signIn.social({ provider: "discord", ... })` branch. Keep the greeting `Text`; render the `Pressable` only when a session exists: `{session ? <Pressable onPress={() => void authClient.signOut()} className="bg-primary flex items-center rounded-sm p-2"><Text className="text-foreground">Sign Out</Text></Pressable> : null}`. Phase 2 replaces the `null` branch with the form.
6. **Docs and records (factual corrections, not new docs).**
   - `sb-stack-v1/AGENTS.md` packages bullet: replace `packages/auth — better-auth on node:sqlite; Discord OAuth only (unconfigured in dev → sign-in returns 500), oAuthProxy + Expo plugins.` with `packages/auth — better-auth on node:sqlite; email & password only (no email sending), Expo plugin.`
   - `README.md`: (a) tree comment `better-auth on node:sqlite; oAuthProxy + Expo plugins, Discord provider` → `better-auth on node:sqlite; email & password, Expo plugin`; (b) env table rows `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` (currently one row or two — delete whichever exists) ; (c) the sentence `Both the web and Expo apps sign in (Discord OAuth or better-auth's email flows via authClient) and render the post list with TanStack Query.` → `Both the web and Expo apps sign in with email and password via authClient and render the post list.` (adjust the TanStack Query clause to keep it true — only Expo uses TanStack Query today).
   - Delete `specs/divergences/05-E-discord-oauth-unverified.md` — its blocking external prerequisite (Discord credentials) is void because the provider is gone.
   - `specs/done/05-E-apps-server-and-web.md`: on the `- [ ]` criterion at line ~148 and at divergence 9 (line ~192), append one sentence each: `Superseded 2026-10-28: the Discord provider was removed in favor of email & password; this criterion is void.` Do not flip the checkbox; the historical record stays honest.

### Phase 2 — Email & password (server + both clients)

1. **`packages/auth/src/index.ts`** — add to `BetterAuthOptions` config (exact literal):
   ```ts
   emailAndPassword: {
     enabled: true,
   },
   ```
   Nothing else: `requireEmailVerification` omitted (= false), `autoSignIn` omitted (= true, sign-up returns a session immediately), password min length stays better-auth's default 8. No `sendResetPassword`/`sendVerificationEmail` — those endpoints stay unconfigured and unused.
2. **Web form — `apps/web/src/routes/index.tsx`, `AuthShowcase` fallback.** Reuse the `CreatePostForm` signal/error patterns and follow `apps/web/AGENTS.md` Solid 2 primer (reads in JSX/handlers only; `affects(x); refresh(x)` to refetch). Component contract (labels and button names are the e2e selectors — keep exact):
   - State: `mode = createSignal<"signin" | "signup">("signin")`, `name`, `email`, `password`, `formError = createSignal<string | null>(null)` (all `createSignal("")` except mode/error).
   - Fallback renders `<form class="auth-form" onSubmit={submit}>` with:
     - `<h2>` text `Create account` (signup) / `Sign in` (signin).
     - Name field only when `mode() === "signup"`: `<label>Name<input type="text" required value={name()} onInput={...} /></label>`.
     - `<label>Email<input type="email" required .../></label>`, `<label>Password<input type="password" required minlength={8} .../></label>`.
     - `<Show when={formError()}>{(m) => <p class="form-error">{m()}</p>}</Show>`.
     - Submit button text `Sign up` (signup) / `Sign in` (signin).
     - Toggle button text `Need an account? Sign up` (signin) / `Have an account? Sign in` (signup); `onClick` flips `mode`.
   - `submit` handler: `event.preventDefault()`; then
     - signup: `const { error } = await authClient.signUp.email({ name: name(), email: email(), password: password() })`
     - signin: `const { error } = await authClient.signIn.email({ email: email(), password: password() })`
   - On `error`: `setFormError(error.message)`. On success: clear `name`/`email`/`password`, `setMode("signin")`, then `affects(props.session); void refresh(props.session);` (same refetch pattern the existing `signOut` uses — better-auth's vanilla client also toggles its session signal on auth actions, but the Solid memo holds a stale promise, hence the explicit refresh).
   - `signOut` and the signed-in block (`Signed in as {user().name ?? user().email}`, `Sign out` button) stay as-is.
3. **Expo form — `apps/expo/src/app/index.tsx`, `MobileAuth`.** React Native (`useState` from `react`, already imported):
   - State: `mode` (`"signin" | "signup"`, default `"signin"`), `name`, `email`, `password`, `error` (string|null).
   - When `session` is falsy render: the existing `Not logged in` greeting text, then (signup mode only) a `TextInput` for name, `TextInput`s for email and password (`secureTextEntry`, `autoCapitalize="none"`), reusing the existing input className `border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight`; an error `<Text className="text-destructive">` when `error`; a submit `Pressable` labeled `Sign up`/`Sign in`; a toggle `Pressable` labeled `Need an account? Sign up` / `Have an account? Sign in` flipping `mode`. Reuse `CreatePost`'s error-text styling.
   - Submit: `const { error } = mode === "signup" ? await authClient.signUp.email({ name, email, password }) : await authClient.signIn.email({ email, password });` → on `error` `setError(error.message)`; on success clear fields, `setMode("signin")`, `setError(null)`. The `authClient.useSession()` hook refreshes automatically (client toggles its `$sessionSignal` after matched auth actions — verified in `better-auth/dist/client/proxy.mjs` onSuccess listener dispatch).
   - When `session` is truthy: greeting + `Sign Out` `Pressable` (as today). Form and greeting are mutually exclusive.

### Phase 3 — Auth tables under `pnpm db:migrate`

1. **Capture the DDL from the installed better-auth (do not hand-invent columns).** From `packages/auth` (so `better-auth` resolves), run a throwaway probe against a temp file:
   ```sh
   rm -f /tmp/auth-schema-probe.db*
   cd packages/auth
   bun -e '
   import { DatabaseSync } from "node:sqlite";
   const { getMigrations } = await import("better-auth/db/migration");
   const config = { database: new DatabaseSync("/tmp/auth-schema-probe.db"), baseURL: "http://localhost:3000", secret: "probe", emailAndPassword: { enabled: true } };
   const m = await getMigrations(config);
   console.log("PROBLEMS", JSON.stringify(m.schemaProblems));
   await m.runMigrations();
   const db = new DatabaseSync("/tmp/auth-schema-probe.db", { readOnly: true });
   for (const row of db.prepare("select type, name, sql from sqlite_master where sql is not null and name not like 'sqlite_%' order by case type when 'table' then 0 else 1 end, name").all()) console.log("--", row.type, row.name, "\n" + row.sql + ";");
   '
   ```
   Expect `PROBLEMS []` and exactly the four tables `account`, `session`, `user`, `verification` plus their indexes. Taking DDL from `sqlite_master` (rather than `getMigrations().compileMigrations()`, whose `compile().sql` can contain `?` bind placeholders for static defaults) guarantees literal, sqlite-exact SQL. The probe file is scratch; nothing from it is committed except the pasted SQL.
2. **New migration `packages/db/src/migrations/AuthTablesMigration.ts`** — copy the class shape of `InitialMigration` (`export class AuthTablesMigration extends Migration`, `override name = "AuthTablesMigration"`):
   - `up()`: one `this.addSql(...)` per captured statement, with every `create table` rewritten to `create table if not exists` and every `create index`/`create unique index` to `create ... index if not exists` (SQLite supports both). `if not exists` makes the migration safe on dev DBs where the old boot-time better-auth migration already created the tables. No other rewrite of the captured SQL.
   - `down()`: `drop table if exists` in child-first order: `"verification"`, `"account"`, `"session"`, `"user"` (indexes drop with their tables).
   - No MikroORM entities for these tables: better-auth's own adapter performs all reads/writes on them; entities would be dead metadata. `mikro-orm.config.ts` and `initDb()`'s `entities` stay `[Post]`. Future `migration:create` diffs are entity-driven, so the untracked tables are ignored (they are never dropped).
   - Migration order vs `InitialMigration` is irrelevant (disjoint tables).
3. **`packages/auth/src/index.ts` — stop migrating at boot.** Delete the `getMigrations` import (`better-auth/db/migration`), the `const { runMigrations } = ...; await runMigrations();` lines, and replace their comment block with: `// Auth tables are created by packages/db migrations (pnpm db:migrate); run them before boot, same contract as the post table. A fresh unmigrated DB logs better-auth's "Database schema mismatch" until then.` `initAuth` stays `async` with the same return type.

### Phase 4 — Testing (integration + e2e) and CI

1. **Integration suite, `bun test`.** New file `apps/server/test/auth-flow.test.ts` (uses `bun:test` — `@types/bun` already in `apps/server` devDeps):
   - `beforeAll`: set `process.env.DATABASE_URL` to a fresh throwaway path (`join(mkdtempSync(join(tmpdir(), "acme-auth-test-")), "test.db")`); run the real migration command `Bun.spawnSync(["pnpm", "db:migrate"], { cwd: <workspace root = new URL("../../..", import.meta.url)>, env: { ...process.env, DATABASE_URL: <same path> }, stdout: "inherit", stderr: "inherit" })` and assert `exitCode === 0` (varlock passes explicit env through — verified; `migration:up` is `cache: false` in `nx.json` — verified); then `initDb()` (from `@acme/db`), `initAuth({ baseUrl: "http://localhost:3000", databaseUrl: getDatabasePath(), secret: "test-secret" })`, `createApp({ auth, orm })`. `afterAll`: close orm + auth (`orm.close()`).
   - Request helper: `app.handle(new Request("http://localhost:3000" + path, init))`; cookie helper extracts `set-cookie` via `res.headers.getSetCookie().map(c => c.split(";")[0]).join("; ")` and replays it as a `cookie` request header. (No socket listen; Playwright covers the wire.)
   - `apps/server/package.json` gets `"test": "bun test"`. `apps/server/tsconfig.json` `include` gains `"test"` so the suite is typechecked.
   - `apps/server/eslint.config.ts`: append a config block `{ files: ["test/**"], rules: { "no-restricted-properties": "off" } }` (the `restrictEnvAccess` rule forbids `process.env`, which the bootstrap needs).
   - Test cases (fresh DB in `beforeAll`, one shared user per case where noted):
     1. **schema**: `orm.em.getConnection().execute("select name from sqlite_master where type = 'table'")` includes `user`, `session`, `account`, `verification`, `post`.
     2. **sign-up creates a session**: `POST /api/auth/sign-up/email` JSON `{"name":"Ada","email":"ada@example.com","password":"password1234"}` → `res.ok`; body `user.email === "ada@example.com"`; `set-cookie` contains `better-auth.session_token`; `GET /api/auth/get-session` with that cookie → `res.ok` and body user email matches.
     3. **protected route rejects anonymous**: `POST /api/posts` JSON `{"title":"t","content":"c"}` without cookie → status `401` (the `authed` macro's `status(401)` — repo-owned).
     4. **protected route accepts session**: same request with the sign-up cookie → `res.ok`; `GET /api/posts` includes the row.
     5. **sign-in**: `POST /api/auth/sign-in/email` with wrong password → `res.ok === false` and body `code === "INVALID_EMAIL_OR_PASSWORD"`; with correct password → `res.ok` and a `better-auth.session_token` cookie.
     6. **duplicate sign-up**: sign up again with `ada@example.com` → `res.ok === false` and body `code === "USER_ALREADY_EXISTS"`.
     7. **sign-out**: `POST /api/auth/sign-out` with the cookie → `res.ok`; `GET /api/auth/get-session` afterwards has no user (`expect(json?.user ?? json?.data?.user ?? null).toBeNull()`).
2. **Playwright web e2e.**
   - `pnpm --filter @acme/web add -D @playwright/test` (resolves current 1.x; single consumer, no catalog entry) and add script `"e2e": "playwright test"` to `apps/web/package.json`.
   - New `apps/web/playwright.config.ts`:
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
     (`getDatabasePath()` resolves relative `DATABASE_URL` against the workspace root regardless of cwd; `data/` is gitignored; `/api/auth/ok` is the proven auth health endpoint from spec 05. Fresh DB each run ⇒ fixed fixture emails are deterministic.)
   - New `apps/web/e2e/auth.spec.ts`, two tests, selectors matching Phase 2 exactly:
     1. `sign up, create a post, sign out`: `page.goto("/")` → click `getByRole("button", { name: "Need an account? Sign up" })` → fill `getByLabel("Name")` = `E2E User`, `getByLabel("Email")` = `e2e-1@example.com`, `getByLabel("Password")` = `password1234` → click `getByRole("button", { name: "Sign up", exact: true })` → expect `getByText(/Signed in as/)`. Then fill `getByLabel("Title")` = `Hello e2e`, `getByLabel("Content")` = `created by playwright` → click `getByRole("button", { name: "Create" })` → expect `.post-list` to contain `Hello e2e`. Then click `getByRole("button", { name: "Sign out" })` → expect `getByRole("button", { name: "Need an account? Sign up" })` visible and `getByRole("button", { name: "Create" })` hidden (form gated on session).
     2. `sign in rejects a wrong password and accepts the right one`: `page.goto("/")` → click `Need an account? Sign up` → sign up `e2e-2@example.com` / `password1234` → `Sign out` (mode resets to signin on success, so the sign-in form is showing) → fill `e2e-2@example.com` + `wrong-password` → click `getByRole("button", { name: "Sign in", exact: true })` → expect `.form-error` visible with text matching `/invalid/i`; then fill `password1234` → click `Sign in` → expect `getByText(/Signed in as/)`.
3. **CI — `.github/workflows/ci.yml`**, append two jobs (the shared `./tooling/github/setup` already installs pnpm, node, and bun — verified):
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

## Critical files & anchors

| File | Anchor | Why |
| --- | --- | --- |
| `packages/auth/src/index.ts` | `initAuth` options + `BetterAuthOptions` literal | Every auth-behavior change lands here: plugin/social removal (P1), `emailAndPassword` (P2), migration-runner removal (P3). |
| `apps/web/src/routes/index.tsx` | `AuthShowcase` | Discord button removal + the new form; its `SourceAccessor`/`affects`/`refresh` session plumbing is easy to break (Solid 2 primer). |
| `apps/expo/src/app/index.tsx` | `MobileAuth` | Discord social call → email/password form; RN, not Solid. |
| `packages/db/src/migrations/InitialMigration.ts` | whole file | Shape to copy for `AuthTablesMigration` (`Migration` subclass, `override name`, `addSql`). |
| `apps/server/.env.schema` | `@import(..., pick=[...])` | The pick list must lose the Discord names or codegen keeps emitting them. |

## Verification

Working directory `sb-stack-v1/` unless noted. Prereqs: `pnpm install` already done; bun on PATH.

1. **Migration owns the schema (new behavior)**:
   `rm -f data/sqlite.db data/sqlite.db-shm data/sqlite.db-wal && pnpm db:migrate` exits 0, then
   `bun -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("data/sqlite.db", { readOnly: true }); console.log(db.prepare("select name from sqlite_master where type = ? order by name").all("table").map(r => r.name));'`
   prints `account, mikro_orm_migrations, post, session, user, verification`.
2. **Boot is clean**: `pnpm --filter @acme/server dev` (after step 1) logs `🦊 Elysia running at http://localhost:3000` and never logs `Database schema mismatch` or `BETTER AUTH API ERROR`; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/ok` → `200`.
3. **Integration suite (new behavior end-to-end over HTTP)**: `pnpm --filter @acme/server test` → all cases in Phase 4.1 pass (schema tables, sign-up→session→create post, 401 anonymous, sign-in wrong/right password, duplicate sign-up, sign-out). This is the regression test to keep.
4. **Web e2e (real browser)**: once `cd apps/web && pnpm exec playwright install chromium`, then `pnpm --filter @acme/web e2e` → 2 tests pass (sign-up → create post → sign-out hides the form; wrong password rejected, right password signed in).
5. **Expo manual smoke**: `cd apps/expo && CI=false pnpm exec expo start --ios --go`, with the server from step 2 running. In the app: sign up with `mobile@example.com` / `password1234` → greeting shows the name; create a post → it appears in the list; `Sign Out` → form returns. (No simulator in CI — this leg stays manual.)
6. **Discord is gone**: `grep -rni discord . --include="*.ts" --include="*.tsx" --include="*.schema" --include="*.json" --include="*.md"` from `sb-stack-v1/` prints nothing except `apps/web/README.md` (Solid template's community-chat link — intentionally kept, not auth code) and nothing in `packages/`, `apps/server/`, `apps/web/src/`, `apps/expo/src/`.
7. **Workspace gates**: `pnpm typecheck` exits 0 (new test files are in `apps/server`'s tsconfig `include`; e2e/config files typecheck under `apps/web`'s unrestricted tsconfig).
8. **Migration idempotence on pre-existing DBs**: with a DB that already contains the auth tables (e.g. `data/sqlite.db` from before this change), `pnpm db:migrate` exits 0 without errors (`if not exists`).

## Assumptions & contingencies

- **Auth feature scope**: sign-up, sign-in, sign-out, session only. Password reset / email verification deliberately excluded (no email provider). If wanted later, they need `sendResetPassword`/`sendVerificationEmail` in `emailAndPassword`/`emailVerification` plus UI — not planned here.
- **Sign-up auto-signs-in** (better-auth `autoSignIn` default). Changing to explicit sign-in-after-sign-up is a one-line config flip (`autoSignIn: false`) plus tests/UX updates.
- **Form UX**: single form with a sign-in/sign-up toggle on both platforms (no separate routes). Route-splitting (`/sign-in`) would replace the toggle step only.
- **DDL capture**: if the probe in Phase 3.1 prints non-empty `PROBLEMS` or missing tables, stop and record it — do not hand-write columns. If `sqlite_master` dump somehow contains `?` placeholders, inline the literal values from `m.toBeCreated` field metadata and re-run the probe to compare.
- **Playwright `webServer` sequencing** is order-independent (migration happens inside the server's command chain). If `pnpm --filter @acme/web:check` (CI `check-web`) rejects the new `e2e/**`/`playwright.config.ts` files, exclude those paths in the tool it complains about (tsconfig `exclude` or eslint ignores) — one line, then re-run.
- **`bun test` bootstrap**: if lint still flags `process.env` inside `apps/server/test/**` despite the Phase 4.1 eslint override, replace the override with a single `// eslint-disable-next-line no-restricted-properties` on the assignment line — behavior unchanged.
- **Existing local `.env`** may keep stale `AUTH_DISCORD_*` keys; remove them only if `pnpm env:validate` errors.
