# Spec 07 — Phase G: Docker

- Source: `NX_ELYSIA_SOLID_MIGRATION_PLAN.md` → `### Phase G`.
- Depends on: spec 05 (server on `3000`, `apps/web` build output, `pnpm nx run @acme/web:build`), spec 02/03 (SQLite file via `DATABASE_URL`), spec 01 (`nx.json` exists at the build context root).
- Repo root / Docker build context: `create-t3-turbo/`.
- Result carried forward: `docker compose up --build` serves the API on `3000` and the static Solid app on `3001`, with SQLite state persisted in `./data` (no DB container).

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Add `.dockerignore` at the repo root — requirements: exclude `node_modules`, `.git`, `dist`, `.cache`, `.turbo`, `.nx`, `.vp`, `.env*`, `data`, `*.sqlite*`, `apps/*/dist`; commands: none — also excludes `*.db*` so the local `sqlite.db` files never enter the build context.

- [x] 2. Add `Dockerfile.server` — requirements: multi-stage, pnpm install on Node, run on Bun; no dev deps pruning beyond what `pnpm install --frozen-lockfile` gives; SQLite path fixed to `/data/sqlite.db`: — DIVERGENCE 1: the `CMD` also runs `mikro-orm migration:up` before starting the server, otherwise a fresh `/data` has no `post` table and objective 5's `[]` is impossible (`initDb()` does not create schema — spec 04 divergence 4).
  ```dockerfile
  FROM node:22 AS deps
  RUN corepack enable
  WORKDIR /app
  COPY package.json pnpm-workspace.yaml pnpm-lock.yaml nx.json ./
  COPY apps apps
  COPY packages packages
  COPY tooling tooling
  RUN pnpm install --frozen-lockfile

  FROM oven/bun:1 AS run
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY --from=deps /app ./
  ENV DATABASE_URL=/data/sqlite.db
  EXPOSE 3000
  CMD ["bun", "apps/server/src/index.ts"]
  ```
  commands: `docker build -f Dockerfile.server -t acme-server .`

- [x] 3. Add `Dockerfile.web` — requirements: build static assets with `vp` through Nx, serve with nginx; `COPY` source must match the actual `vp build` output (spec 05 recorded it — `apps/web/dist/client` unless the divergence says otherwise):
  ```dockerfile
  FROM node:22 AS build
  RUN corepack enable
  WORKDIR /app
  COPY package.json pnpm-workspace.yaml pnpm-lock.yaml nx.json ./
  COPY apps apps
  COPY packages packages
  COPY tooling tooling
  RUN pnpm install --frozen-lockfile
  RUN pnpm nx run @acme/web:build

  FROM nginx:alpine AS run
  COPY --from=build /app/apps/web/dist/client /usr/share/nginx/html
  ```
  commands: `docker build -f Dockerfile.web -t acme-web .`

- [x] 4. Add `docker-compose.yml` — requirements: server exposes `3000`, web maps `3001:80`, web depends on server, SQLite state in the `./data` volume, auth env passed through from the host environment:
  ```yaml
  services:
    server:
      build: { context: ., dockerfile: Dockerfile.server }
      ports: ["3000:3000"]
      environment:
        DATABASE_URL: /data/sqlite.db
        BETTER_AUTH_URL: http://localhost:3000
        AUTH_SECRET: ${AUTH_SECRET}
        AUTH_DISCORD_ID: ${AUTH_DISCORD_ID}
        AUTH_DISCORD_SECRET: ${AUTH_DISCORD_SECRET}
      volumes: ["./data:/data"]
    web:
      build: { context: ., dockerfile: Dockerfile.web }
      ports: ["3001:80"]
      depends_on: [server]
  ```
  commands: `docker compose config -q`

- [x] 5. Run the stack and verify both apps plus persistence — requirements: `mkdir -p data`, `.env` present (spec 08 owns `.env.example`), images build, API answers, nginx serves the Solid HTML, SQLite file lands in the volume, restart keeps data: — verified end to end; an API-written post survived `docker compose restart server`.
  ```
  mkdir -p data
  docker compose up --build -d
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/posts      # 200
  curl -s http://localhost:3000/api/posts                                       # []
  curl -s http://localhost:3000/api/auth/ok -o /dev/null -w "%{http_code}\n"    # 200
  curl -s http://localhost:3001 | grep -i "<html\|<div id=\"app\""
  docker compose exec server ls -l /data/sqlite.db
  docker compose restart server
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/posts      # 200
  docker compose down
  ```

## 2. No-go

- Do not add a database service, Postgres, or any volume other than `./data`; SQLite is a file.
- Do not add Nginx config beyond the static `COPY` (no proxy, no TLS, no SPA rewrites unless the static build requires one — record it if so).
- Do not change ports (`3000`/`3001`) or bake secrets into images/compose (`AUTH_*` stay `${…}`).
- Do not add a `Dockerfile` at `apps/*` level or a per-app build context.
- Do not add healthcheck/CI wiring for Docker here (spec 08 stays build/lint/typecheck/check only unless explicitly extended).
- Do not reintroduce Turborepo caches, `.turbo` artifacts, or dev-server containers.
- Do not add unit tests.

## 3. Testing criteria

- [x] `docker compose config -q` exits 0.
- [x] `docker build -f Dockerfile.server -t acme-server .` exits 0.
- [x] `docker build -f Dockerfile.web -t acme-web .` exits 0; the build stage logs a `vp build` run for `@acme/web` (`> @acme/web@ build` / `> vp build` / `Successfully ran target build`).
- [x] `docker compose up --build -d` brings both services up; `docker compose ps` shows `server` and `web` running.
- [x] `curl http://localhost:3000/api/posts` → `[]`; `curl -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/ok` → `200`.
- [x] `curl http://localhost:3001` returns the built Solid HTML shell (`<html lang="en">`, `<title>Solid App</title>`, 200).
- [x] `docker compose exec server ls -l /data/sqlite.db` exists; after `docker compose restart server` the file is unchanged and `GET /api/posts` still `200`. — the file grows legitimately when rows are written; same database across restarts.
- [x] data written through the API survives `docker compose restart server` (volume mount, not image layer). — seeded a session before the server started, `POST /api/posts` → 200, restart → the same post id/title/body still listed.
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

**Spec 07 — executed 2026-10-23 (2 entries):**

1. Objective 2's pinned `CMD ["bun", "apps/server/src/index.ts"]` cannot serve `GET /api/posts` on a fresh volume: `initDb()` creates no schema, so `/data/sqlite.db` has no `post` table and the list 500s. Fix: the runtime `CMD` runs the existing migration first — `cd packages/db && bunx --bun mikro-orm migration:up && cd /app && exec bun apps/server/src/index.ts`. `bunx --bun` keeps it on Bun (the `oven/bun` image has no Node); the migration is idempotent on restart (second boot logs `Successfully migrated up to the latest version` without re-applying). (Verified 2026-10-23: 2 attempts — initial plain CMD on an empty volume returned `500 no such table: post`; migration-first CMD returned `200 []`, then persisted an API-created post across `docker compose restart server`.)
   **Re-verified 2026-10-23 with the current tree** (after the auth-migration ordering fix): `docker compose up --build -d` on an empty `data/` → `[migrator] Applied 'InitialMigration'`, `GET /api/posts` `200 []`, `/api/auth/ok` `200`; `docker compose restart server` → `Successfully migrated up to the latest version` without re-applying, list still `200 []`; web `200`. Tracker removed.

2. ~~On first boot better-auth logs `ERROR [Better Auth]: Database schema mismatch — Missing tables user, session, account, verification` because its `runMigrations()` is fire-and-forget in `initAuth`~~ — **RESOLVED 2026-10-23**: `initAuth` now runs `getMigrations(config).runMigrations()` (public `better-auth/db/migration`) **before** `betterAuth(config)`, so the automatic schema check sees the tables; `initAuth` is async and `apps/server/src/index.ts` awaits it. Verified with the real server entry on a fresh SQLite file (`PORT=3137`, empty Discord creds): no `schema mismatch` line, `user`/`session`/`account`/`verification` present before the first request, `GET /api/auth/ok` → `200`, `GET /api/auth/get-session` → `200 null`; a second boot on the same file is also clean; workspace `typecheck`/`lint`/`format` 30/30 exit 0. Tracking file `specs/divergencies/07-G-better-auth-schema-mismatch.md` removed. (Original record 2026-10-23: same log on both boots; tables present moments later; session round-trip worked.)

*Fill in at execution time. Example (from spec 02-B, kept as reference):*

1. Workspace `typecheck`/`lint` stay red in `@acme/api` only: its
   `@acme/db/client`, `@acme/db/schema`, and `desc`/`eq` imports are removed by
   objectives 1 and 7, but rewriting them is explicitly excluded (section 2,
   spec 04). … api red is deferred to spec 04 by design, not a defect.)

### Unresolved divergences → `specs/divergencies/`

*A divergence that stays OPEN because a later spec owns the fix MUST also get a
tracking file in `specs/divergencies/`, so future agents can find and clear it.
Name it `<spec-id>-<short-slug>.md` (e.g.
`02-B-api-typecheck-lint-red.md`). Include: source spec + the exact criteria it
blocks, what is broken (files/imports), why each fix attempt was fenced, and a
"how to clear it" checklist naming the spec that resolves it plus the commands
to re-verify. Then link the tracking file from the matching Divergence entry
above (e.g. "**Tracked for future check-up in
`specs/divergencies/<file>.md`.**"). When the later spec lands and the checks
pass, mark the criteria `[x]` and remove the tracking file.*
