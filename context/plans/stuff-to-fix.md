# sb-stack-v1 — readiness audit: stuff to fix before launch

Audit of `sb-stack-v1/` as a monorepo template. Scope: all hand-written source in `apps/`, `packages/`, `tooling/`, root configs, CI, Docker. `node_modules`, `ios/Pods`, `.cache`, lockfile contents excluded. Findings are grounded in `file:line` evidence; everything listed as verified clean was actually exercised/read.

**Verdict: not ready to publish.** 5 major items (2 real bugs in the shipped reference deployment, 1 publish-state bug, 2 doc/policy contradictions), 14 minor bugs/duplication, 11 hygiene items.

Severity: **major** = broken behavior or false docs an adopter will hit; **minor** = latent bug, drift, or noise.

---

## A. Easy-to-miss bugs

### A1. All clients share one 60 req/min bucket behind the documented nginx deployment — `bug` · major
`packages/api/src/rate-limit.ts:23-25` keys the limiter on the socket peer:
```ts
// Bucket by socket address: XFF is client-spoofable (nginx appends, and
// port 3000 is directly exposed), so it must never key the limiter.
const ip = server?.requestIP(request)?.address ?? "unknown";
```
The keying choice is deliberate and sound for direct exposure, but in the reference deployment (`nginx/web.conf:9-10` proxies `/api/` → `server:3000`; `docker-compose.yml`) every request arrives from the one nginx container IP. All users collectively exhaust 60 auth requests/minute; the 61st gets 429 until window reset. `README.md:171` promises "per IP (`x-forwarded-for`, else the socket address)" — the code never reads XFF, so the docs and behavior disagree in both directions.
**Fix:** key on `X-Real-IP` only when the socket peer is the trusted proxy (or move `/api/auth` limiting to nginx `limit_req` per `$remote_addr`); rewrite README:171 to describe actual keying.

### A2. No `busy_timeout` on either SQLite connection — intermittent `SQLITE_BUSY` 500s — `bug` · major
The server opens **two independent connections** to the same SQLite file: `packages/db/src/index.ts:23-27` (`NodeSqliteDialect` opens its own `DatabaseSync`) and `packages/auth/src/index.ts:21` (`new DatabaseSync(options.databaseUrl)`). Only `PRAGMA journal_mode=WAL` is set; neither connection sets `busy_timeout`, and `node:sqlite` installs no busy handler by default. WAL serializes writers, so a write-write collision (e.g. better-auth session write while `POST /api/posts` flushes) fails immediately with "Database is locked" → intermittent 500s under concurrency.
**Fix:** `PRAGMA busy_timeout = 5000` on both connections (next to the WAL pragma in `initDb`, and right after `new DatabaseSync(...)` in `initAuth`).

### A3. Publish state ships a known navigation bug and drops its covering e2e test — `template` · major
Git state at audit time: ` M apps/web/src/routes/users/[id].tsx` (fix: memo + `<Show>` for `nextId`/`hasNext`) and `?? apps/web/e2e/users.spec.ts` (asserts the 1→2→3 sequence). At HEAD, `const nextId = Number(props.params.id) + 1` (`users/[id].tsx:40`) is computed eagerly; `@solidjs/router` reuses the component across `/users/1 → /users/2`, freezing the "Next user" link. A git-tag/archive publish would ship the bug and lose the test that catches it.
**Fix:** commit both files before tagging/publishing.

### A4. Security headers missing on short-circuit/error responses (401, 422, 500, not-found) — `bug` · minor
`packages/api/src/index.ts:46-48` stamps `SECURITY_HEADERS` in `onAfterHandle`, but Elysia's macro-`resolve` early return (`packages/api/src/middleware.ts:10`'s `if (!session) return status(401)`), validation throws, and the not-found path never run `onAfterHandle`. `rate-limit.ts:35-38` manually spreads the headers with the comment "Early return skips the response pipeline" — the gap is known but patched only for 429. `apps/server/test/auth-flow.test.ts:285-287` claims "security headers are applied to every response" but probes only 200-OK paths. README:169 promises "every response".
**Fix:** stamp headers where the 401 is built in `middleware.ts` and in an `onError` hook; extend the test to assert on a 401 and a 422.

### A5. Web `PostList` renders "No posts yet." when the API call fails — `bug` · minor
`apps/web/src/routes/index.tsx:194-196`: `<Show when={props.posts().data} fallback={<p class="empty">No posts yet.</p>}>`. Eden treaty returns `{ data: null, error }` for 4xx/5xx, so a failed fetch renders the empty state — indistinguishable from a genuinely empty DB.
**Fix:** branch the fallback on `props.posts().error`.

### A6. Expo home screen swallows post-list HTTP errors — `bug` · minor
`apps/expo/src/app/index.tsx:197-200`: `queryFn: () => api.api.posts.get().then((r) => r.data)` — on HTTP error `r.data` is `null`, which React Query treats as success; `postQuery.isError` is never rendered. `src/app/post/[id].tsx:29` shows the intended `if (isError || !data)` pattern, so this reads as unintentional.
**Fix:** `if (r.error) throw` in `queryFn`; render the error state.

### A7. Expo base-URL hardcodes port 3000 and silently overrides `EXPO_PUBLIC_API_URL` — `bug` · minor
`apps/expo/src/utils/base-url.ts:11`: `` return `http://${localhost}:3000`; `` — taken whenever `Constants.expoConfig?.hostUri` is set (every dev run). A non-3000 API (exported `PORT`, remote API, tunnel, devcontainer) is unreachable even with `EXPO_PUBLIC_API_URL` configured correctly; the hardcoded port is invisible to `env:validate`.
**Fix:** override only the hostname; derive scheme/port from `new URL(ENV.EXPO_PUBLIC_API_URL)`.

### A8. `EXPO_PUBLIC_API_URL` default `http://localhost:3000` silently breaks release builds on devices — `template` · minor
`apps/expo/.env.schema:7`. In release builds `hostUri` is absent → this default → `localhost` is the phone → all requests fail and the home screen renders silently empty (A6). The server refuses to boot in prod on localhost URLs (`apps/server/src/index.ts:21-29`); the app ships the equivalent footgun unguarded.
**Fix:** warn/fail the release build when the URL is still localhost outside a dev client.

### A9. Playwright e2e env overrides omit `BETTER_AUTH_URL`/`CORS_ORIGINS` — `bug` · minor
`apps/web/playwright.config.ts:18-26`: `env: { ...process.env, NODE_ENV: "development", PORT: "3000", ... }`. The block exists to keep exported env from breaking e2e, but an exported/`.env.local` `CORS_ORIGINS` flows through `...process.env` (CORS-blocks the app under test) or an `https` `BETTER_AUTH_URL` (better-auth issues `Secure` cookies the browser drops over http).
**Fix:** pin `BETTER_AUTH_URL: "http://localhost:3000"` and `CORS_ORIGINS: "http://localhost:3001"` in the same block.

### A10. `DATABASE_URL` URL-style values silently misresolve into garbage paths — `bug` · minor
`packages/db/src/db-path.ts:21-25` resolves bare paths only. `DATABASE_URL=file:./data/x.db` → `<workspace>/file:/data/x.db` (and `mkdirSync` creates a dir named `file:`); `:memory:` opens a real file named `:memory:`. Named like a URL, behaves like a path — silent failure.
**Fix:** strip a leading `file:` scheme (or throw on URL-scheme/`:memory:` input) before resolving.

### A11. List vs detail endpoints return different timestamp formats — `bug` · minor
`packages/api/src/router/post.ts:22-27`: the list aliases raw Kysely rows (`created_at` → `createdAt` as Unix-ms **numbers**, how `SqlitePlatform.processDateProperty` stores Dates), while `wrap(post).toObject()` on detail/create/delete JSON-serializes `Date` to ISO **strings**. The comment claims "exact key set" parity — keys match, types don't. Consumers must handle both.
**Fix:** normalize in the map: `createdAt: new Date(created_at).toISOString()`.

---

## B. Duplicated code

### B1. Trusted-origin/allowed-origin defaults live in four places; `expo://` silently dropped when `trustedOrigins` is passed — `dup` · minor
`packages/api/src/index.ts:21` (`corsOrigins = ["http://localhost:3001"]`), `packages/auth/src/index.ts:28-31` (`trustedOrigins: options.trustedOrigins ?? ["expo://", "http://localhost:3001"]`), `apps/server/src/index.ts:37-38` (re-literalizes `"expo://"` + assembles from `CORS_ORIGINS`), root `.env.schema:22`. Additionally, a caller-supplied `trustedOrigins` **replaces** the default wholesale — dropping `expo://` breaks Expo origin checks with no type-level hint. Changing the web origin in one place only makes CORS and better-auth trusted-origins drift (browser passes, CSRF rejects, or vice versa).
**Fix:** one `DEFAULT_TRUSTED_ORIGINS` constant; `initAuth` always unions `expo://` regardless of caller input.

### B2. Web and expo API clients are near-copies with duplicated derived types — `dup` · minor
`apps/web/src/lib/api.ts:8-10` vs `apps/expo/src/utils/api.tsx:20-21` — identical treaty construction (`fetch: { credentials: "include" }`), expo adds only an `onRequest` cookie hook. Both re-derive the same response types (`api.ts:13` `PostsResult` vs `index.tsx:11-13` `Post`); `apps/expo/src/app/index.tsx:48` re-declares the create-post input inline where `z.infer<typeof CreatePostSchema>` exists. (The `auth.ts` pair diverges by platform plugin/storage — fine as-is.)
**Fix:** `createApi(baseUrl)` factory + `Post`/`PostsResult` types in `packages/api`; use `z.infer` for the input.

### B3. Title length bound defined twice — `dup` · minor
`packages/validators/src/index.ts:4` (`title: z.string().min(1).max(256)`) vs `packages/db/src/entities/post.ts:8` (`title: p.string().length(256)`); the SQLite DDL enforces neither, so the validator is the only real enforcement. Editing one silently drifts the contract.
**Fix:** export `MAX_TITLE_LENGTH` from `@acme/validators`, reference it from both.

### B4. `bunfig.toml` duplicated at root and `apps/server/` — `dup` · minor
Both are load-bearing (Bun reads bunfig from invocation cwd: root covers Docker `bun apps/server/src/index.ts` from `/app`, `apps/server/` covers `pnpm dev`/`bun test`) but with no cross-reference comment one copy will be forgotten on change.
**Fix:** sync-comment in each file (or generate one from the other).

### B5. Identical eslint wrapper configs ×4 — `dup` · minor
`packages/{api,db,validators}/eslint.config.ts` are byte-identical; `packages/auth`'s differs trivially. Standard for eslint flat config (no extends), but a template consumer editing one will drift the rest.
**Fix:** acceptable as-is; at minimum a "keep in sync" comment, or a shared `tooling/eslint/package.ts` preset they all import.

---

## C. Template readiness / docs & hygiene

### C1. README documents an OAuth proxy plugin that does not exist — `template` · major
`README.md:150` (§5, lines 146–156): "it is already enabled in packages/auth". `packages/auth/src/index.ts:24` is the whole plugin list — `plugins: [expo(), ...(options.extraPlugins ?? [])]`; zero `oauth*` matches in the repo; `AGENTS.md:7` says email+password only. Stale upstream-starter residue that sends adopters to deploy a flow on a false premise.
**Fix:** delete §5 or reword as "if you add OAuth providers, add `oauthProxy()`".

### C2. Unit-test suite contradicts the repo's "no unit tests" policy; `Counter` is dead code — `template` · major
`AGENTS.md:19` and `apps/expo/AGENTS.md:48` forbid unit tests, yet `apps/web` ships `Counter.test.tsx`, a vitest/jsdom block (`vite.config.ts:42`), `vitest-setup.ts`, and `README.md:3,34` advertising the sample suite. `Counter.tsx` is imported nowhere except its test. The three-way contradiction (policy / code / README) will cause either policy violations or accidental deletion of documented code.
**Fix:** delete `Counter.tsx`/`Counter.test.tsx` + vitest infra + README section, or amend the AGENTS.md policy.

### C3. README vs code/docs drift — `template` · minor
- `README.md:171`: rate-limit keying description wrong (folded into A1).
- `README.md:102`: env table omits `CORS_ORIGINS` (`.env.schema:21-22`) — the knob for adding a second origin is undiscoverable.
- `README.md:124,127`: "enter `I` to launch Expo Go" / `expo start --ios` contradicts `AGENTS.md:7` and the shipped `expo-dev-client` (plain `--ios` expects a dev build).

### C4. `postinstall` executes unpinned remote code on every install — `template` · minor
`package.json:21-22`: `"lint:ws": "pnpm dlx sherif@latest"` + `"postinstall": "pnpm lint:ws"` — every dev install, all CI jobs (`tooling/github/setup/action.yml:23`), and both Docker builds download and run whatever `sherif@latest` resolves to that moment; not in `package.json`/`pnpm-lock.yaml`, non-hermetic, supply-chain exposure.
**Fix:** pin `sherif` in `devDependencies`; `"lint:ws": "sherif"`.

### C5. Bun pinned in Docker (1.4.4), floats in CI — `template` · minor
`tooling/github/setup/action.yml:11` has no `bun-version`; `engines` has no `bun`. Green CI doesn't imply the production runtime works.
**Fix:** `bun-version: 1.4.4` + `engines.bun`.

### C6. Org-specific references left in — `template` · minor
- `CODEOWNERS:3` `* @serbarla` — live required-reviewer rule for the author's handle in adopter repos. Ship commented out.
- `SECURITY.md:12` and `.github/ISSUE_TEMPLATE/config.yml:6,9` point at `github.com/serbarla/tech-stack` — adopters' vuln reports misroute. Use `OWNER/REPO` placeholders that fail loudly.
- `AGENTS.md:27` instructs filing "a Linear Issue, following the approved format Specs-Issue" — a workflow only the author has.

### C7. Comment mischaracterizes unmigrated-DB behavior — `template` · minor
`packages/auth/src/index.ts:39-41` says it "logs better-auth's 'Database schema mismatch' until then" — better-auth 1.7.12 **throws** `SchemaMismatchError` from `onRequest` and `getSession`; on a fresh unmigrated DB every auth request 500s. Reword the comment.

### C8. Vite-starter residue — `template` · minor
`apps/web/src/logo.svg` (never imported); `App.css:38-39, 69-76` `.logo`/`logo-spin` (referenced by nothing), `.increment` (only dead `Counter`); `apps/expo/src/utils/api.tsx:11-13` empty `defaultOptions.queries` placeholder; `apps/expo/eslint.config.mts:8` ignores nonexistent `expo-plugins/**`; `apps/web/.gitignore:18` ignores any file named `gitignore`.

### C9. Per-env migration snapshots + local build artifacts survive folder/zip distribution — `template` · minor
`packages/db/src/migrations/.snapshot-{e2e,test,sqlite}.db.json`, plus on-disk `data/*.db*`, `apps/expo/ios/` (full Pods tree), `apps/expo/.expo/`, `apps/web/test-results/`, `assets/.DS_Store`. All gitignored and untracked (git distribution is clean), but a directory-copy/zip publication ships stale snapshots (which skew future `migration:create` diffs) and hundreds of MB of build output.
**Fix:** delete before publishing; consider moving MikroORM's snapshot dir out of `src/`.

---

## Verified clean (exercised, not assumed)

- **Secrets:** `.env.local`/`.varlock-frozen-env` hold only varlock ciphertext, never committed (git history clean), gitignored. No plaintext secrets anywhere in tracked files.
- **`.gitignore` coverage** for `data/`, `.expo/`, `ios/`, `test-results/`, `.cache`, `*.db*`, snapshots — confirmed via `git ls-files` (all zero).
- **CI:** every referenced script/target exists; Node from `.nvmrc` satisfies `engines`; `packageManager: pnpm@10.19.0` matches the lockfile; cache keys hash the real lockfile; `master` default base consistent.
- **Docker/compose/nginx:** pnpm install against the pnpm lockfile (bun runtime-only) in both stages; `VITE_API_URL` hard-enforced; ports 3000/3001 wiring consistent across compose, nginx, vite, playwright; `db-path.ts` reads `process.env.DATABASE_URL` directly so the raw Docker `mikro-orm migration:up` CMD works without varlock.
- **Migrations vs better-auth schema:** `AuthTablesMigration` matches better-auth 1.7.12 core tables column-for-column (types, unique, FK cascade, indexes); runtime `diffSchema` passes.
- **Env schema ↔ usage drift:** zero — root `.env.schema` maps 1:1 to all `ENV.*` reads; per-app schemas are `@import` pick lists, no duplicated definitions.
- **Rate-limit math:** exactly 60-then-429 per 60s fixed window; eviction bounded; matches its test.
- **Post routes:** per-request `em.fork()` (no shared-em races); 404-before-delete; validator bounds match entity; `@sinclair/typebox` is a live elysia peer dep.
- **E2E ↔ routes/endpoints:** all Playwright selectors and routes exist; `/api/auth/ok` is a real better-auth route; `test-results/.last-run.json` records a pass on the working tree.
- **Auth clients:** web cookie-based (`credentials: "include"` both sides), expo via `expo-secure-store` + per-request cookie injection — no token-storage gap found statically.
- **tooling presets:** eslint/tsconfig/prettier shared via `tooling/*` with thin wrappers; `theme.css` vs `theme-native.css` have zero token drift.
