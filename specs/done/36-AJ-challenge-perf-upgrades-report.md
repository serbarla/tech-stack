# Spec 36 AJ — Challenge perf upgrades: QA verification report

- Date: 2026-10-30
- Scope: independent test & assurance of the landed changes in
  `specs/done/36-AJ-challenge-perf-upgrades.md` (all four objectives).
- Repo root: `sb-stack-v1/`; commands run from there unless noted.
- Verdict: **PASS** — all four upgrades landed as specified; stability,
  security, and performance improvements are confirmed by live measurement.
  One out-of-scope observation and one residual risk noted (neither is a
  defect of this change).

## 1. Method

1. Code audit: full working-tree diff vs spec objectives and No-go list.
2. Static: `pnpm typecheck && pnpm lint && pnpm --filter @acme/server test`,
   re-run uncached for fresh evidence, plus `pnpm lint:ws` (sherif).
3. Runtime: pragma probe on the real `initDb` connection; body-cap boundary
   probe against a live `pnpm --filter @acme/server start` instance.
4. Deployment smoke: `docker compose up --build -d` with the spec's env, then
   availability, upstream keep-alive, and gzip assertions through nginx.

## 2. Implementation conformance

| Objective | Surface | Conformance |
|---|---|---|
| 1. SQLite pragmas (shared constant) | `packages/db/src/pragmas.ts`, `packages/db/src/index.ts`, `packages/auth/src/index.ts`, `packages/auth/package.json` | Exact: 6 statements as specified, `initDb()` loops the list (old single `journal_mode` line deleted), re-export present, `@acme/db` added as `workspace:*` dep of `@acme/auth`, `initAuth` signature unchanged, hoisted `database`, all statements applied, no error handling (fail-fast preserved) |
| 2. Bun.serve tuning | `apps/server/src/index.ts` | Exact: `serveOptions { port, idleTimeout: 70, maxRequestBodySize: 1_048_576 }`, `.listen(serveOptions, …)`; typecheck accepted the plain object — no cast needed |
| 3. nginx upstream keep-alive | `nginx/web.conf` | Exact: `upstream api { keepalive 32; keepalive_timeout 60s; keepalive_requests 1000 }`, `proxy_pass http://api;` (no URI suffix), `proxy_http_version 1.1`, `proxy_set_header Connection ""`, existing Host/X-Real-IP/X-Forwarded-* headers untouched |
| 4. nginx gzip | `nginx/web.conf` | Exact: `gzip on; gzip_min_length 1024;` + the 4 specified types; `gzip_comp_level` left at default |

No-go compliance: diff touches only the 5 spec files + `pnpm-lock.yaml`
(workspace dep) + new `pragmas.ts`. No route/response-shape, validator, auth
config (beyond pragmas), `apps/web`, `apps/expo`, env-key, or unit-test changes.

## 3. Static verification

| Check | Result |
|---|---|
| `pnpm typecheck` (13 Nx tasks) | green; re-run with `--skip-nx-cache` — fresh green |
| `pnpm lint` (10 Nx tasks) | green; re-run with `--skip-nx-cache` — fresh green |
| `pnpm --filter @acme/server test` | 13 pass / 0 fail (50 assertions); boots real `createApp`/`initAuth`, so it exercises the pragmas on better-auth's connection including sign-in writes |
| `pnpm lint:ws` (sherif) | No issues found (workspace dep consistency) |

## 4. Runtime verification

### 4.1 Pragmas on the real `initDb` connection

`bun -e` probe printing `PRAGMA <name>` via `orm.em.getConnection()`:

| PRAGMA | Expected | Observed |
|---|---|---|
| `journal_mode` | `"wal"` | `"wal"` |
| `synchronous` | `2` (FULL) | `2` |
| `busy_timeout` | `5000` | `5000` |
| `mmap_size` | `536870912` | `536870912` |
| `cache_size` | `-65536` | `-65536` |
| `temp_store` | `2` (MEMORY) | `2` |

The better-auth connection runs the identical `SQLITE_PRAGMA_STATEMENTS`
(verified in code); its observable proof is the green auth-flow suite (§3).

### 4.2 Body cap (live server, port 3000)

| Payload | Result |
|---|---|
| 2 MiB JSON POST `/api/auth/sign-up/email` | **413** (empty body — transport-level from Bun, not app JSON) |
| 1 048 575 B | 400 (app-level: filler isn't valid JSON → reached the app) |
| 1 048 576 B (= limit) | 400 (reached the app — cap is inclusive) |
| 1 048 577 B (= limit + 1) | **413** |
| Normal sign-up body | **200** (cap does not break normal traffic) |

Boundary is exact at 1 MiB + 1. Method note: an invalid body returns 422/400
before the auth guard runs, so "response is not 413" is the correct pass
signal for sub-cap payloads.

### 4.3 Deployment smoke (docker compose, per criterion 4)

Env: `AUTH_SECRET=$(openssl rand -base64 32)`,
`BETTER_AUTH_URL=http://127.0.0.1:3000` (spec-20 production guard rejects
`localhost`), `VITE_API_URL=http://localhost:3001`.

| Assertion | Observed |
|---|---|
| Both containers healthy (`docker compose ps` healthchecks) | server `healthy`, web up |
| `GET /api/auth/ok` ×2 back-to-back | 200, 200 |
| `GET /api/auth/ok` after `sleep 2` (idle gap) | 200 — reuse after idle, no 502/reset |
| ESTABLISHED upstream sockets after 20-request warm-up | **10** (one per nginx worker — `worker_processes auto`) |
| Same count after 20 more requests | **10** — flat; connections reused, not opened/closed per request |
| Largest asset `index-CBG6o2f7.js` (130 299 B), `Accept-Encoding: gzip` | `Content-Encoding: gzip` |
| Smallest asset `users-Ti2pEaqw.js` (164 B) | no `Content-Encoding` — `gzip_min_length 1024` honored |
| `GET /api/posts` with a 3 KB post seeded (authed, cookie session) | `Content-Encoding: gzip` — `application/json` compression proven end-to-end |

Teardown: `docker compose down` clean.

## 5. Assessment

### Stability
- Both SQLite connections now share one pragma owner (`pragmas.ts`), removing
  config drift between MikroORM and better-auth connections.
- `busy_timeout = 5000` absorbs transient `SQLITE_BUSY` under concurrent
  writes instead of surfacing as request failures.
- `synchronous = FULL`: an acknowledged write survives a crash (fsync per
  commit — deliberate cost, pinned never below FULL).
- `idleTimeout: 70` (Bun default is 10 s) keeps sockets alive past nginx's
  60 s upstream window; `keepalive_timeout 60s < 70` means nginx retires idle
  sockets first — the ordering that prevents 502s/RSTs on reuse. Observed
  zero failed requests across the smoke, including across the idle gap.
- Fail-fast contract intact: a failing PRAGMA throws at boot.

### Security
- 1 MiB transport body cap: bounds request-memory amplification (DoS) at the
  server boundary, before application parsing. Exact boundary verified;
  response is the transport's empty 413 (spec-specified, not hand-rolled JSON).
- No new attack surface: no auth, route, validator, or web/expo changes.
  `CreatePostSchema.content` stays unbounded by design — the 1 MiB transport
  cap is the bound.
- Upstream keep-alive wiring is header-safe: `Connection ""` + HTTP/1.1 only;
  `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` pass through
  unchanged.
- Residual (accepted, informational): gzip + attacker-influenced response
  content is the BREACH family. In this deployment the compressed JSON
  surfaces (e.g. `/api/posts`, attacker-controllable `content`) carry no
  secrets, and auth responses containing session tokens are ≈300 B — below
  the deliberate `gzip_min_length 1024`, hence never compressed. Keeping
  `gzip_min_length` at ≥1024 preserves this property; a future change that
  compresses token-bearing responses together with user input should revisit
  this.

### Performance
- WAL: readers no longer block the writer; `mmap_size 512 MiB` removes read
  syscalls for hot pages; `cache_size -65536` = 64 MiB page cache;
  `temp_store = MEMORY` avoids temp-file I/O — all measured live (§4.1).
- Upstream keep-alive pool (`keepalive 32`, `keepalive_requests 1000`, one
  pool per worker): eliminates per-request TCP setup/teardown nginx→Bun.
  Measured: socket count flat at 10 under sustained traffic.
- gzip on JSON/static ≥1 KiB at the default level 1 — cheap on 1-CPU hosts;
  small bodies deliberately uncompressed to avoid CPU waste for no gain.
  Measured: 130 KB asset compressed, 164 B asset untouched.

## 6. Findings

- F1 (pass): All 4 objectives implemented exactly; No-go list respected.
- F2 (pass): All static suites green (fresh, uncached) + workspace consistency.
- F3 (pass): Pragma values match the spec on a live connection.
- F4 (pass): Body cap exact at 1 MiB + 1; normal traffic unaffected.
- F5 (pass): Keep-alive reuse verified (flat socket count, no errors across
  idle gaps); gzip verified for both static and JSON responses.
- F6 (info): Body-cap probing must use "not 413" as the sub-cap pass signal —
  validation errors (400/422) fire before the auth guard (pre-existing Elysia
  ordering, not introduced by this spec).
- F7 (info): The spec's one-socket keep-alive wording was corrected to
  "one per worker" in spec divergence 3; this run independently reproduces
  exactly that (10 workers → 10 sockets).

## 7. Verdict

**PASS.** The challenge perf upgrades landed successfully. Durability and
stability guarantees (FULL sync, WAL, busy_timeout, timeout ordering) hold
under live measurement; the security posture improves (1 MiB transport cap,
no new attack surface) with one understood, currently-dormant gzip residual;
performance gains (connection reuse, compression, SQLite tuning) are
demonstrated through the real deployment, not just unit-level.
