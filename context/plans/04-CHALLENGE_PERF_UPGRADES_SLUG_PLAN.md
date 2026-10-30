# Challenge perf upgrades (slug: `challenge-perf-upgrades`)

## Context

The user wants techniques from https://github.com/arjaythedev/twelve-dollar-server-challenge (pinned commit `f0f53e7`, ~64k users on 1 vCPU / 2 GB RAM) safely ported into `sb-stack-v1/` as operational upgrades. The challenge's relevant submission, `submissions/bun-elysia-shashishsoni`, runs **the exact same stack** as `sb-stack-v1`: Bun + Elysia (lockfile resolves `elysia@1.4.30`, `Dockerfile.server` is `oven/bun:1.4.4`) over SQLite. Its safe, semantics-neutral techniques are: SQLite connection pragmas, keep-alive discipline between the reverse proxy and Bun, and Bun.serve tuning. Its other techniques (hand-rolled JWT, single-statement `likes`, raw-`Response` handlers, wire-format `RETURNING` tricks) are **not** portable: this app uses better-auth sessions and a deliberate zod validation layer.

Approved scope (user selections): SQLite pragmas + keep-alive chain (Bun `idleTimeout` + nginx upstream keepalive) + 1 MiB request-body cap + nginx gzip. Durability: **`synchronous` stays FULL** (user choice; pin it explicitly rather than relying on the SQLite default). End state: zero route/auth/API behavior change except one documented change — request bodies >1 MiB now get HTTP 413 (today Bun accepts up to 128 MiB).

## Approach

All paths relative to `sb-stack-v1/` unless prefixed. Steps 1 and 2 are independent; step 3 MUST land with or after step 2 (step 2 raises Bun's idle timeout so nginx can safely reuse upstream sockets); step 4 is independent. Every step leaves `pnpm typecheck && pnpm lint && pnpm --filter @acme/server test` green.

### Step 0 — create the repo-mandated spec file

Create `specs/36-AJ-challenge-perf-upgrades.md` (relative to the project root that contains `sb-stack-v1/`) from `specs/TEMPLATE.md`. Numbering confirmed: history ends at `specs/done/35-AI-expo-sdk-drift-gate.md`. Fill exactly:

- Source: plan `local://challenge-perf-upgrades-plan.md` (techniques from `arjaythedev/twelve-dollar-server-challenge@f0f53e7`, submission `submissions/bun-elysia-shashishsoni`).
- Depends on: nothing (keeps the 14-N suites and 20-T hardening green).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: both SQLite connections run WAL + FULL + busy_timeout/mmap/cache/temp pragmas; Bun.serve runs `idleTimeout: 70` with a 1 MiB body cap; nginx reuses upstream keep-alive connections and gzips JSON/static responses.
- Section 1 Objectives: one `- [ ]` item per step 1–4 below (verb phrase + the requirement literals from this plan).
- Section 2 No-go: never set `synchronous` below FULL; no route/response-shape changes; no validator changes (`CreatePostSchema.content` stays unbounded — the cap is transport-level only); no auth changes (no hand-rolled JWT, no better-auth config changes beyond pragmas on its connection); no changes in `apps/web` or `apps/expo`; no new unit tests; no new env keys.
- Section 3 Testing criteria: the Verification commands below, one checkbox each.

Check each `- [x]` as its step lands. On completion with no open divergences, move the file to `specs/done/` (template housekeeping).

### Step 1 — SQLite pragmas on BOTH connections (shared constant)

Two connections open the same database file: MikroORM's (via `NodeSqliteDialect`) and better-auth's `DatabaseSync`. `busy_timeout` is load-bearing because both write (sessions on sign-in, posts on create) — without it a concurrent write gets an instant `SQLITE_BUSY`. Per-connection pragmas (everything except `journal_mode`) must be applied to both.

1. New file `packages/db/src/pragmas.ts` — no equivalent exists; this is the single owner of SQLite connection config:

   ```ts
   // SQLite connection pragmas for every connection to the app database:
   // MikroORM's (initDb in ./index.ts) and better-auth's node:sqlite
   // DatabaseSync (initAuth in @acme/auth). All except journal_mode are
   // per-connection, so both call sites must run the full list.
   // synchronous=FULL is a deliberate durability choice (over WAL's usual
   // NORMAL): a crash may never lose an acknowledged write.
   export const SQLITE_PRAGMA_STATEMENTS = [
     "PRAGMA journal_mode = WAL",
     "PRAGMA synchronous = FULL",
     "PRAGMA busy_timeout = 5000",
     "PRAGMA mmap_size = 536870912", // 512 MiB
     "PRAGMA cache_size = -65536", // 64 MiB, lazily allocated
     "PRAGMA temp_store = MEMORY",
   ] as const;
   ```

2. `packages/db/src/index.ts` — in `initDb()`, replace the single line `await orm.em.getConnection().execute("PRAGMA journal_mode=WAL");` with a loop over the list (clean cutover; the old line is deleted):

   ```ts
   for (const statement of SQLITE_PRAGMA_STATEMENTS) {
     await orm.em.getConnection().execute(statement);
   }
   ```

   Re-export from the index beside the existing re-exports: `export { SQLITE_PRAGMA_STATEMENTS } from "./pragmas";`. Import it into `index.ts` as `import { SQLITE_PRAGMA_STATEMENTS } from "./pragmas";`.

3. `packages/auth/package.json` — add `"@acme/db": "workspace:*"` to `dependencies` (sort order: `@acme/db`, `@better-auth/expo`, `better-auth`; `@acme/db` imports nothing from `@acme/auth`, so no cycle; `sherif` runs in `postinstall` and validates workspace consistency).

4. `packages/auth/src/index.ts` — `initAuth` keeps its signature (spec 13 contract). Add `import { SQLITE_PRAGMA_STATEMENTS } from "@acme/db";` and replace the inline `database: new DatabaseSync(options.databaseUrl)` with:

   ```ts
   const database = new DatabaseSync(options.databaseUrl);
   for (const statement of SQLITE_PRAGMA_STATEMENTS) database.exec(statement);
   ```

   then use `database,` in the `BetterAuthOptions` object.

No error handling added: a failing PRAGMA throws at boot and crashes startup — the same fail-fast contract `initDb()`/`MikroORM.init` already has. Values chosen from the challenge submission (proven on this Bun/SQLite pairing); `synchronous=FULL` replaces its `NORMAL` per the durability decision above.

### Step 2 — Bun.serve tuning via Elysia's listen options

`apps/server/src/index.ts` tail — replace `createApp({ auth, orm, corsOrigins: parsedOrigins }).listen(ENV.PORT, () => { … })` with an options object (no signature/behavior change elsewhere in the file):

```ts
const serveOptions = {
  port: ENV.PORT, // varlock @type=number — no coercion needed
  idleTimeout: 70, // seconds; must exceed nginx's upstream keepalive_timeout (60s)
  maxRequestBodySize: 1_048_576, // 1 MiB; larger bodies get HTTP 413 from Bun
};
createApp({ auth, orm, corsOrigins: parsedOrigins }).listen(serveOptions, () => {
  console.log(`🦊 Elysia running at http://localhost:${ENV.PORT}`);
});
```

Notes pinned for the implementer: `idleTimeout: 70` keeps sockets open past nginx's 60 s upstream keepalive window so nginx never reuses a socket Bun just closed (the same reasoning as the challenge's 70 s against its bench nginx); Bun's default idle timeout is 10 s. Runtime forwarding of these options to `Bun.serve` is proven on exactly `elysia@1.4.30` by the challenge submission's `app.listen({ hostname, port, idleTimeout: 70 }, …)`.

Typing fallback (see Assumptions #2): if `listen(serveOptions, …)` fails `pnpm typecheck`, use the submission's proven cast — add `import type { Elysia } from "elysia";` and `.listen(serveOptions as Parameters<Elysia["listen"]>[0], …)` (add `"elysia": "catalog:"` to `apps/server/package.json` dependencies only if that import doesn't resolve). If the cast is flagged as unnecessary by lint, drop it.

The 413 body is Bun's transport-level response (not the app's `{"error":…}` JSON) — acceptable because clients treat non-2xx generically and the limit is transport policy, not API semantics; do not hand-roll a JSON 413.

### Step 3 — nginx upstream keep-alive (`nginx/web.conf`)

Today `location /api/` uses `proxy_pass http://server:3000;` with nginx's default HTTP/1.0 upstream — a fresh TCP connection per API request. Change:

1. Add at the top of the file, above `server {`:

   ```nginx
   upstream api {
       server server:3000;
       keepalive 32;
       keepalive_timeout 60s;
       keepalive_requests 1000;
   }
   ```

   `keepalive_timeout 60s` is pinned explicitly and must stay below Bun's `idleTimeout: 70` (step 2) so nginx retires idle upstream sockets before Bun would. `keepalive 32` = idle upstream connections to the single backend on the compose network.

2. In `location /api/`, change `proxy_pass http://server:3000;` to `proxy_pass http://api;` (no URI suffix — the `/api/…` path passes through unchanged, same as today) and add two lines above the existing `proxy_set_header` block:

   ```nginx
       proxy_http_version 1.1;
       proxy_set_header Connection "";
   ```

   Keep the existing `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` headers exactly as they are. `upstream` with a name resolves at nginx start; the compose `web` service already `depends_on: server: service_healthy`, so `server` resolves when nginx starts (unchanged failure mode: if the server dies later, nginx answers 502 as today).

### Step 4 — gzip in nginx (`nginx/web.conf`)

Add inside `server {` (e.g. right after `index index.html;`):

```nginx
    gzip on;
    gzip_min_length 1024;
    gzip_types application/json text/css application/javascript image/svg+xml;
```

Leave `gzip_comp_level` at nginx's default (1 — the cheap setting, right for 1-CPU hosts). Small bodies (<1 KiB, e.g. `{"ok":true}`) are deliberately not compressed.

## Critical files & anchors

| File | Anchor | Why |
|---|---|---|
| `packages/db/src/index.ts` | `initDb()` — the `PRAGMA journal_mode=WAL` execute (~line 19) | replaced by the shared-pragma loop; new sibling `packages/db/src/pragmas.ts` |
| `packages/auth/src/index.ts` | `initAuth` — `database: new DatabaseSync(options.databaseUrl)` | hoist + apply pragmas; signature unchanged (spec 13) |
| `apps/server/src/index.ts` | `.listen(ENV.PORT, …)` tail | options object; only this call site listens |
| `nginx/web.conf` | `location /api/` proxy block | upstream keepalive + gzip; only nginx config in the repo |
| `packages/auth/package.json` | `dependencies` | new `"@acme/db": "workspace:*"` |

## Verification

Prereqs (cwd `sb-stack-v1/`): `pnpm i` (this checkout has no `node_modules`), `pnpm db:migrate` (creates `data/sqlite.db` with auth + post tables). docker smokes need `docker` + `docker compose`; `AUTH_SECRET`/`BETTER_AUTH_URL`/`VITE_API_URL` exports shown per the README.

1. **Suites** (also run after each step): `pnpm typecheck && pnpm lint && pnpm --filter @acme/server test` → all green (the server suite is `apps/server/test/auth-flow.test.ts`, which boots a real `createApp`/`initAuth` against a temp DB and therefore exercises the pragmas on better-auth's connection end-to-end, sign-in write included).

2. **Pragmas, observed through the real `initDb` connection** (per-connection values can't be seen from a fresh CLI connection, so introspect through the code path itself):
   ```bash
   bun -e 'import { initDb } from "./packages/db/src/index.ts"; const orm = await initDb(); const c = orm.em.getConnection(); for (const p of ["journal_mode","synchronous","busy_timeout","mmap_size","cache_size","temp_store"]) console.log(p, JSON.stringify(await c.execute("PRAGMA " + p))); process.exit(0);'
   ```
   → `journal_mode` `"wal"`, `synchronous` `2` (FULL), `busy_timeout` `5000`, `mmap_size` `536870912`, `cache_size` `-65536`, `temp_store` `2`. The better-auth connection runs the same `SQLITE_PRAGMA_STATEMENTS` (visible at its call site); its observable proof is the green auth-flow suite in check 1.

3. **Body cap** — boot the server in a second terminal: `pnpm --filter @acme/server start` (port 3000, `.env.schema` defaults). Then:
   ```bash
   head -c 2097152 /dev/zero | tr '\0' 'a' > /tmp/big-body.txt
   curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/auth/sign-up -H 'content-type: application/json' --data-binary @/tmp/big-body.txt   # expect 413
   curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/auth/sign-up -H 'content-type: application/json' -H 'origin: http://localhost:3001' -d "{\"name\":\"cap\",\"email\":\"cap-$RANDOM@test.dev\",\"password\":\"password1234\"}"   # expect 200 — cap must not break normal traffic
   ```
   (The `origin` header is required by better-auth's CSRF middleware on cookie-bearing POSTs.)

4. **Keep-alive chain + gzip through the real deployment**:
   ```bash
   export AUTH_SECRET="$(openssl rand -base64 32)" BETTER_AUTH_URL=http://localhost:3000 VITE_API_URL=http://localhost:3001
   docker compose up --build -d
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/auth/ok   # 200 through the nginx proxy
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/auth/ok
   sleep 2
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/auth/ok   # 200 — reuse must not 502/reset
   docker compose exec -T web sh -c 'netstat -tn 2>/dev/null | grep :3000 || ss -tn | grep :3000'   # one ESTABLISHED connection to server:3000 persisting across the pause (pre-change: nginx opened/closed one per request)
   ASSET=$(docker compose exec -T web sh -c 'ls /usr/share/nginx/html/assets | head -n1' | tr -d '\r')
   curl -sI -H 'Accept-Encoding: gzip' "http://localhost:3001/assets/$ASSET" | grep -i content-encoding   # Content-Encoding: gzip
   ```
   The 70 s idle-timeout value itself is config (challenge-proven on this Elysia version); the observable here is that upstream reuse serves 200s and the socket outlives a 2 s pause. `docker compose down` when done.

## Assumptions & contingencies

1. **Durability pinned, not assumed**: `synchronous = FULL` is written explicitly in `SQLITE_PRAGMA_STATEMENTS` even though it equals the SQLite default — the user chose FULL over the challenge's NORMAL, and an explicit pragma survives driver-default changes. Never downgrade it.
2. **Elysia listen typing** (unverifiable now — no `node_modules` in this checkout): try the plain options object first (step 2). If `pnpm typecheck` rejects it, apply the submission's proven cast `as Parameters<Elysia["listen"]>[0]` with `import type { Elysia } from "elysia";` (add `elysia` to `apps/server` deps only if unresolvable; it is already in the lockfile at 1.4.30 via `@acme/api`). If lint then flags an unnecessary assertion, drop the cast. Runtime forwarding of `idleTimeout`/`maxRequestBodySize` to `Bun.serve` is proven on exactly `elysia@1.4.30` by the challenge submission.
3. **If `maxRequestBodySize` is not honored at runtime** (check 3's first curl doesn't return 413): record a divergence in the spec (section 4) and stop — do NOT hand-roll body limits in Elysia. The rest of the spec still lands.
4. **If the `@acme/auth` → `@acme/db` import trips `sherif`, lint, or an unexpected cycle**: fall back to duplicating the literal `SQLITE_PRAGMA_STATEMENTS` array in `packages/auth/src/index.ts` with a `// keep in sync with @acme/db pragmas.ts` comment; `packages/db` keeps the canonical copy.
5. **If neither `netstat` nor `ss` exists in the web image** (busybox/nginx:alpine normally has `netstat`): `docker compose exec -T web apk add --no-cache iproute2` and rerun the `ss` form — ephemeral container, verification-only.
