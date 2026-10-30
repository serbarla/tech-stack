# Spec 36 — Phase AJ: Challenge perf upgrades

- Source: plan `CHALLENGE_PERF_UPGRADES_SLUG_PLAN.md` (project root; techniques from `arjaythedev/twelve-dollar-server-challenge@f0f53e7`, submission `submissions/bun-elysia-shashishsoni`).
- Depends on: nothing (keeps the 14-N suites and 20-T hardening green).
- Repo root: `sb-stack-v1/`. Every path and command below is relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: both SQLite connections run WAL + FULL + busy_timeout/mmap/cache/temp pragmas; Bun.serve runs `idleTimeout: 70` with a 1 MiB body cap; nginx reuses upstream keep-alive connections and gzips JSON/static responses.

## Before you start

Unit testing is not required; avoid it. Prioritize end-to-end and integration
testing only.

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing.

If reality diverges from this spec: STOP, append a divergence (section 4), and
NEVER improvise outside the objectives.

## 1. Objectives

*The ordered work to implement — one item per step. Check `[x]` only after the
step is implemented and verified.*

*Item format:* `<verb phrase>` — requirements: `<what must change / constraints>`; commands: `<exact command>`.

- [x] 1. Apply SQLite pragmas on both connections (shared constant) — requirements: new `packages/db/src/pragmas.ts` is the single owner of SQLite connection config and exports `SQLITE_PRAGMA_STATEMENTS` = `["PRAGMA journal_mode = WAL", "PRAGMA synchronous = FULL", "PRAGMA busy_timeout = 5000", "PRAGMA mmap_size = 536870912", "PRAGMA cache_size = -65536", "PRAGMA temp_store = MEMORY"]` (everything except `journal_mode` is per-connection, so both call sites must run the full list; `synchronous = FULL` is a deliberate durability choice — a crash may never lose an acknowledged write — and is pinned explicitly, never below FULL); `packages/db/src/index.ts` `initDb()` replaces the single `PRAGMA journal_mode=WAL` execute with a loop over the list (clean cutover; the old line is deleted) and re-exports `export { SQLITE_PRAGMA_STATEMENTS } from "./pragmas";`; `packages/auth/package.json` adds `"@acme/db": "workspace:*"` to `dependencies` (no cycle: `@acme/db` imports nothing from `@acme/auth`; `sherif` validates workspace consistency); `packages/auth/src/index.ts` `initAuth` keeps its signature (spec 13), hoists `const database = new DatabaseSync(options.databaseUrl);`, applies `database.exec(statement)` for every statement in `SQLITE_PRAGMA_STATEMENTS`, and passes `database` to `BetterAuthOptions`; no error handling added — a failing PRAGMA throws at boot and crashes startup (same fail-fast contract as `initDb()`/`MikroORM.init`); if the `@acme/auth` → `@acme/db` import trips `sherif`/lint/cycle: duplicate the literal array in `packages/auth/src/index.ts` with a `// keep in sync with @acme/db pragmas.ts` comment, `packages/db` keeps the canonical copy; commands: `pnpm typecheck && pnpm lint && pnpm --filter @acme/server test`
- [x] 2. Tune Bun.serve via Elysia's listen options — requirements: `apps/server/src/index.ts` replaces `.listen(ENV.PORT, () => { … })` with a `serveOptions` object `{ port: ENV.PORT, idleTimeout: 70, maxRequestBodySize: 1_048_576 }` and `.listen(serveOptions, () => { … })` (no other signature/behavior change in the file); `idleTimeout: 70` keeps sockets open past nginx's 60 s upstream keepalive window so nginx never reuses a socket Bun just closed (Bun's default is 10 s); bodies >1 MiB get HTTP 413 from Bun — a transport-level response, not the app's `{"error":…}` JSON; do NOT hand-roll a JSON 413; if `pnpm typecheck` rejects the plain object, apply the submission's proven cast `serveOptions as Parameters<Elysia["listen"]>[0]` with `import type { Elysia } from "elysia";` (add `"elysia": "catalog:"` to `apps/server/package.json` dependencies only if that import doesn't resolve; drop the cast if lint flags it as unnecessary); commands: `pnpm typecheck && pnpm lint && pnpm --filter @acme/server test`
- [x] 3. Add nginx upstream keep-alive (`nginx/web.conf`) — requirements: add above `server {`: `upstream api { server server:3000; keepalive 32; keepalive_timeout 60s; keepalive_requests 1000; }` (`keepalive_timeout 60s` is pinned and must stay below Bun's `idleTimeout: 70` from objective 2 so nginx retires idle upstream sockets before Bun would); in `location /api/`, change `proxy_pass http://server:3000;` to `proxy_pass http://api;` (no URI suffix — the `/api/…` path passes through unchanged) and add above the existing `proxy_set_header` block: `proxy_http_version 1.1;` and `proxy_set_header Connection "";`; keep the existing `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` headers exactly as they are; commands: `pnpm typecheck && pnpm lint && pnpm --filter @acme/server test`
- [x] 4. Add gzip in nginx (`nginx/web.conf`) — requirements: add inside `server {` (e.g. right after `index index.html;`): `gzip on; gzip_min_length 1024; gzip_types application/json text/css application/javascript image/svg+xml;`; leave `gzip_comp_level` at nginx's default (1 — the cheap setting, right for 1-CPU hosts); small bodies (<1 KiB, e.g. `{"ok":true}`) are deliberately not compressed; commands: `pnpm typecheck && pnpm lint && pnpm --filter @acme/server test`

## 2. No-go

*What this spec MUST NOT do, even if convenient. Never touch anything listed here.*

- never set `synchronous` below FULL
- no route/response-shape changes
- no validator changes (`CreatePostSchema.content` stays unbounded — the cap is transport-level only)
- no auth changes (no hand-rolled JWT, no better-auth config changes beyond pragmas on its connection)
- no changes in `apps/web` or `apps/expo`
- no new unit tests
- no new env keys

## 3. Testing criteria

*Observable proof the spec is complete. Every box checked = spec done.*

Prereqs (cwd `sb-stack-v1/`): `pnpm i` (this checkout has no `node_modules`), `pnpm db:migrate` (creates `data/sqlite.db` with auth + post tables). Docker smokes need `docker` + `docker compose`; `AUTH_SECRET`/`BETTER_AUTH_URL`/`VITE_API_URL` exports shown per the README.

- [x] 1. Suites (also run after each step): `pnpm typecheck && pnpm lint && pnpm --filter @acme/server test` → all green. (The server suite is `apps/server/test/auth-flow.test.ts`: it boots a real `createApp`/`initAuth` against a temp DB and therefore exercises the pragmas on better-auth's connection end-to-end, sign-in write included.)
- [x] 2. Pragmas observed through the real `initDb` connection: `bun -e 'import { initDb } from "./packages/db/src/index.ts"; const orm = await initDb(); const c = orm.em.getConnection(); for (const p of ["journal_mode","synchronous","busy_timeout","mmap_size","cache_size","temp_store"]) console.log(p, JSON.stringify(await c.execute("PRAGMA " + p))); process.exit(0);'` → `journal_mode` `"wal"`, `synchronous` `2` (FULL), `busy_timeout` `5000`, `mmap_size` `536870912`, `cache_size` `-65536`, `temp_store` `2`. (The better-auth connection runs the same `SQLITE_PRAGMA_STATEMENTS`; its observable proof is the green auth-flow suite in box 1.)
- [x] 3. Body cap: boot the server in a second terminal with `pnpm --filter @acme/server start` (port 3000, `.env.schema` defaults), then `head -c 2097152 /dev/zero | tr '\0' 'a' > /tmp/big-body.txt` and `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' --data-binary @/tmp/big-body.txt` → 413; then `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3001' -d "{\"name\":\"cap\",\"email\":\"cap-$RANDOM@test.dev\",\"password\":\"password1234\"}"` → 200 (the cap must not break normal traffic). If the first curl does not return 413, record a divergence in section 4 and stop — do NOT hand-roll body limits in Elysia; the rest of the spec still lands.
  - Verified 2026-10-30: 2 MiB body → 413, normal body → 200 at `/api/auth/sign-up/email` (the literal `/api/auth/sign-up` 404s — better-auth only exposes the `/email` sub-route).
- [x] 4. Keep-alive chain + gzip through the real deployment: `export AUTH_SECRET="$(openssl rand -base64 32)" BETTER_AUTH_URL=http://127.0.0.1:3000 VITE_API_URL=http://localhost:3001` (the spec 20 production boot guard rejects a `localhost` `BETTER_AUTH_URL`, so the loopback IP form is required in the `NODE_ENV=production` image); `docker compose up --build -d`; `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/auth/ok` → 200 (twice back-to-back, then `sleep 2` and the same curl once more → 200 — reuse must not 502/reset); `docker compose exec -T web sh -c 'netstat -tn 2>/dev/null | grep :3000 || ss -tn | grep :3000'` → at least one ESTABLISHED connection to server:3000 whose count stays flat while traffic continues (nginx keeps one upstream keep-alive pool per worker, so warm every worker first: run 20 requests, record the count, send 20 more, confirm the count is unchanged; pre-change each request opened/closed its own socket; if neither `netstat` nor `ss` exists, `docker compose exec -T web apk add --no-cache iproute2` and rerun the `ss` form); `ASSET=$(docker compose exec -T web sh -c 'ls -S /usr/share/nginx/html/assets | head -n1' | tr -d '\r')` (largest file, so it clears the deliberate `gzip_min_length 1024`); `curl -sI -H 'Accept-Encoding: gzip' "http://localhost:3001/assets/$ASSET" | grep -i content-encoding` → `Content-Encoding: gzip`; `docker compose down` when done.
  - Verified 2026-10-30: after the 20-request warm-up, 10 ESTABLISHED sockets to server:3000 (one per nginx worker — `worker_processes auto` = 10 in the Docker VM) and the count stayed at 10 across 20 further requests. The single-socket wording was corrected in section 4 entry 3; the `BETTER_AUTH_URL` guard and gzip asset selection were likewise cleared by spec-text corrections and re-verified through this compose smoke.
- [x] every objective in section 1 is checked

## 4. Divergences

*Process and tracking-file rules: see `AGENTS.md` (§ Spec-Driven Development).
Summary: when reality diverges from the spec, append a numbered entry below;
leave the matching testing-criteria `- [ ]` unchecked and note the divergence
inline next to it. Open divergences owned by a later spec also get a tracking
file in `specs/divergences/`.*

- [x] every divergence found is appended below (or the section reads "None.")

*Entry format (one numbered item per divergence):*

1. <what diverged and its current state> — <why it could not be done as
   written, citing the No-go rule or spec that blocks it> (Verified <date>:
   <N> fix attempts — <attempt 1>, <attempt 2>, <attempt 3> — all fenced by
   <constraint>; <impact> is deferred to <later spec> by design, not a defect.)

### Divergences

All four divergences are resolved (spec text corrected, smoke re-run, tracking
files deleted). Objectives and code are complete and verified.

1. RESOLVED 2026-10-30. Testing criterion 3's normal-traffic curl targeted
   `/api/auth/sign-up`, but the mounted better-auth 1.7 handler only exposes
   `/api/auth/sign-up/email` (`packages/api/src/index.ts` mounts `auth.handler`
   verbatim); the literal path returned 404, the correct path returned 200 with
   a session token. Criterion 3's two curls were corrected to
   `/api/auth/sign-up/email` and re-run on `pnpm --filter @acme/server start`:
   2 MiB body → 413, normal body → 200. No route or implementation change;
   tracking file deleted.
2. RESOLVED 2026-10-30. Testing criterion 4's
   `BETTER_AUTH_URL=http://localhost:3000` made the compose `server` container
   exit 1: the image runs `NODE_ENV=production`, and the spec 20 obj. 6 boot
   guard rejects a localhost `BETTER_AUTH_URL` (`apps/server/src/index.ts`).
   Criterion 4's export was corrected to
   `BETTER_AUTH_URL=http://127.0.0.1:3000`; `docker compose up --build -d`
   rebuilt cleanly, both containers reached `healthy`
   (`docker compose ps`), and three `curl http://localhost:3001/api/auth/ok`
   calls (two back-to-back, one after `sleep 2`) returned 200. No
   implementation change; tracking file deleted.
3. RESOLVED 2026-10-30. Criterion 4 expected "one ESTABLISHED connection", but
   nginx defaults to `worker_processes auto` (10 workers in the Docker VM),
   each holding its own upstream keep-alive pool, so the count is one socket
   per worker — pinning `worker_processes 1` only to satisfy the assertion
   would change production behaviour the spec never asked for. Criterion 4's
   assertion was reworded to "at least one ESTABLISHED connection whose count
   stays flat while traffic continues", with a 20-request warm-up so every
   worker has opened its pool socket. Re-verified through the full compose
   smoke: 10 ESTABLISHED sockets after warm-up (up from 3 at first contact,
   one per worker as each was hit), and the count stayed at 10 across 20
   further requests (`curl http://localhost:3001/api/auth/ok` → 200
   throughout). No implementation change; tracking file deleted.
4. RESOLVED 2026-10-30. Criterion 4's `ls …/assets | head -n1` picked a
   438-byte chunk, below the deliberate `gzip_min_length 1024`, so that asset
   was correctly not compressed. Criterion 4's selection was corrected to
   `ls -S …/assets | head -n1` (largest file). Re-verified through the full
   compose smoke: `ls -S` selected `index-CBG6o2f7.js` (130,299 bytes) and
   `curl -sI -H 'Accept-Encoding: gzip' http://localhost:3001/assets/index-CBG6o2f7.js`
   returned `Content-Encoding: gzip`, while the smallest asset
   (`users-*.js`, 164 bytes) returned no `Content-Encoding`. No implementation
   change; tracking file deleted.

---

*Housekeeping: once a spec is fully done with no open divergences, move its
file to `specs/done/` (e.g. `specs/done/01-A-nx-in-turborepo-nextjs-tanstack-out.md`).
Specs with open divergences stay in `specs/` next to `TEMPLATE.md` until the
tracking file is cleared.*
