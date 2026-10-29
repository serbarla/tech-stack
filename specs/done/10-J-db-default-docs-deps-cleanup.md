# Spec 10 — Phase J: Default `data/sqlite.db`, docs, client deps, artifact cleanup

- Source: `SINGLE_DATABASE_BACKEND_PLAN.md` → Steps 4–6 + full Verification.
- Depends on: spec 09 (resolver + wiring landed; `getDatabasePath()` exported from `@acme/db`, `initAuth` takes `databaseUrl`).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it.
- Result carried forward: `DATABASE_URL` defaults to `data/sqlite.db` in `.env.schema` and README; `@acme/web` no longer depends on `@acme/api` at runtime; the stale stray `sqlite.db` files are gone and never recreated; exactly one SQLite file (`data/sqlite.db`) exists and only the backend writes it. Docker is unaffected (`Dockerfile.server` sets absolute `ENV DATABASE_URL=/data/sqlite.db`, which `getDatabasePath()` passes through as-is; `docker-compose.yml` already mounts `./data:/data`).

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Flip the default env to `data/sqlite.db` — requirements: root `.env.schema` line `DATABASE_URL=./sqlite.db` becomes `DATABASE_URL=data/sqlite.db`; the comment above it stays; the `@type=string @sensitive=false @dynamic=boot` annotation line stays; commands: `grep -n "DATABASE_URL\|@dynamic=boot" .env.schema`

- [x] 2. Update the two local-DB mentions in `README.md` — requirements: the Quick Start note (line ~71, "default `./sqlite.db`") and the env table row (line ~100, "`./sqlite.db` locally, `/data/sqlite.db` in Docker") both say `data/sqlite.db` for the local default; the Docker mentions (`/data/sqlite.db`, lines ~100 and ~183) do NOT change; commands: `grep -n "sqlite.db" README.md`

- [x] 3. Remove the client-side runtime dependency on backend code — requirements: in `apps/web/package.json` move `"@acme/api": "workspace:*"` out of `dependencies` into `devDependencies` (insert before `"@acme/tsconfig"`, exactly how `apps/expo/package.json` declares it) — the only usage is `import type { App } from "@acme/api"` in `apps/web/src/lib/api.ts` (type-only, erased at build); `@acme/validators` and `better-auth` (client) stay in `dependencies`; run `pnpm install` to sync the `pnpm-lock.yaml` web importer entry (the workspace link moves from `dependencies` to `devDependencies`; no version changes); commands: `pnpm install && pnpm --filter @acme/web list --prod`

- [x] 4. Remove stale SQLite artifacts — requirements: delete the gitignored runtime DB files that are now unreachable (all `*.db*` are gitignored): repo-root `sqlite.db`, `sqlite.db-shm`, `sqlite.db-wal`; `apps/server/sqlite.db`, `apps/server/sqlite.db-shm`, `apps/server/sqlite.db-wal`; `packages/db/sqlite.db`; keep `data/sqlite.db` (and its `-shm`/`-wal`) out of the deletion list — it is the canonical file and `pnpm db:migrate` recreates it if absent; commands: `ls sqlite.db apps/server/sqlite.db packages/db/sqlite.db` (each must report "No such file or directory")

## 2. No-go

- Do not touch resolver/wiring code (`packages/db/src/db-path.ts`, `packages/db/src/index.ts`, `packages/db/mikro-orm.config.ts`, `packages/auth/src/index.ts`, `apps/server/src/index.ts`) — spec 09 owns it.
- Do not change the Docker mentions in README or any file under `Dockerfile.*` / `docker-compose.yml`.
- Do not remove `data/` from `.gitignore` or commit `.env`, secrets, `*.db*` files, or a `data/` directory.
- Do not change ports, `DATABASE_URL` semantics beyond the default value, or the `node:sqlite` runtime choice.
- Do not add unit tests.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `pnpm lint && pnpm format && pnpm typecheck` exit 0 (repo root).
- [x] objective 1: `grep -n "DATABASE_URL\|@dynamic=boot" .env.schema` prints exactly `DATABASE_URL=data/sqlite.db` plus the unchanged `@type=string @sensitive=false @dynamic=boot` annotation.
- [x] objective 2: `grep -n "sqlite.db" README.md` shows `data/sqlite.db` as the local default (lines ~71 and ~100) and the `/data/sqlite.db` Docker mentions unchanged (lines ~100 and ~183).
- [x] objective 3: `pnpm --filter @acme/web list --prod` output does NOT include `@acme/api` or `@acme/db`; `pnpm install` a second time reports no lockfile changes; `pnpm nx run @acme/web:build` exits 0 (the type-only `@acme/api` import resolves from devDependencies).
- [x] objective 4 + single-file end state (plan Verification 2–4, no env override — the new default does the work): `rm -f data/sqlite.db data/sqlite.db-shm data/sqlite.db-wal && pnpm db:migrate` exits 0 and recreates `data/sqlite.db`, then `bun -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("data/sqlite.db", { readOnly: true }); console.log(db.prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name").all("table"));'` lists `mikro_orm_migrations` and `post`; `ls sqlite.db apps/server/sqlite.db packages/db/sqlite.db` reports each missing; with `pnpm --filter @acme/server start` running (no env override; wait for `🦊 Elysia running at http://localhost:3000`) the same inspect also lists `user`, `session`, `account`, `verification`; `curl -s http://localhost:3000/api/posts` returns a JSON array served from `data/sqlite.db`; `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/protected` prints `401`; after stopping the server the `ls` still reports all three missing (nothing recreates the strays).
- [x] `git status --short` shows no `.env`, no `sqlite.db*`, no `data/`.
- [x] every objective in section 1 is checked (divergences, if any, appended here).

## 4. Divergences

*REQUIRED at the end of every spec. If reality diverged from this spec while
executing it, append a numbered entry here — do not silently drop it and do not
edit the objectives to match what you actually did. Each entry: what diverged,
why, the fix attempt(s), and (if unresolved) a pointer to a tracking file. Keep
the `- [ ]` testing-criteria box unchecked and note the divergence inline next
to it, exactly as in `specs/02-B-database-drizzle-to-mikroorm-kysely.md`.*

- [x] every divergence found is appended below (or the section reads "None.")

*Format (one numbered item per divergence):*

1. <what diverged and its current state> — <why it could not be done as
   written, citing the No-go rule or spec that blocks it> (Verified <date>:
   <N> fix attempts — <attempt 1>, <attempt 2>, <attempt 3> — all fenced by
   <constraint>; <impact> is deferred to <later spec> by design, not a defect.)

### Divergences

1. The literal `pnpm install` of objective 3 failed with `ERR_PNPM_OUTDATED_LOCKFILE` on first run — the executing shell has `CI=true`, which makes pnpm default to `frozen-lockfile`, and the lockfile was intentionally stale at that point (Verified 2026-10-27: 1 fix attempt — reran as `pnpm install --no-frozen-lockfile`, which synced the lockfile; the criterion's second plain `pnpm install` then exits 0 with a byte-identical `pnpm-lock.yaml` checksum, so no objective/criterion is affected; the flag is an environment default, not a repo change.)
2. The lockfile sync run also normalized an unrelated `uniwind@1.12.0` peer-dependency hash in the `apps/expo` importer (peer set gains `metro-cache@0.87.1(bufferutil@4.0.8)` / `metro-transform-worker@0.87.1(bufferutil@4.0.8)`), beyond the "web importer entry" change objective 3 describes — pnpm re-resolution on install, no version changes (Verified 2026-10-27: second install checksum-identical; impact nil — a cosmetic peer-hash refresh, not a defect).
3. The `bun` table listing also includes `sqlite_sequence` (SQLite-internal AUTOINCREMENT bookkeeping) alongside `mikro_orm_migrations`/`post` and, with the server running, `user`/`session`/`account`/`verification` — every table the criteria name is present; the extra internal table is noise in the `ORDER BY name` output (Verified 2026-10-27: read-only inspect after `pnpm db:migrate` and with the server live; no fix needed).

### Unresolved divergences → `specs/divergences/`

*A divergence that stays OPEN because a later spec owns the fix MUST also get a
tracking file in `specs/divergences/`, so future agents can find and clear it.
Name it `<spec-id>-<short-slug>.md` (e.g.
`02-B-api-typecheck-lint-red.md`). Include: source spec + the exact criteria it
blocks, what is broken (files/imports), why each fix attempt was fenced, and a
"how to clear it" checklist naming the spec that resolves it plus the commands
to re-verify. Then link the tracking file from the matching Divergence entry
above (e.g. "**Tracked for future check-up in
`specs/divergences/<file>.md`.**"). When the later spec lands and the checks
pass, mark the criteria `[x]` and remove the tracking file.*
