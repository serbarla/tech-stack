# AGENTS.md — `@acme/server`

HTTP server: **Elysia on Bun**, port 3000 (`ENV.PORT`). This is a thin bootstrap — it wires together `@acme/api`, `@acme/auth` and `@acme/db`; the logic lives in those packages. All paths and commands below are relative to `apps/server/`.

## Commands

```bash
pnpm dev        # NODE_ENV=development bun --watch src/index.ts
pnpm start      # bun src/index.ts
pnpm test       # bun test  (integration: test/auth-flow.test.ts)
pnpm typecheck  # tsc --noEmit   (tsconfig types: ["bun", "node"])
pnpm lint       # eslint --flag unstable_native_nodejs_ts_config
pnpm format     # prettier --check
pnpm clean      # git clean -xdf .cache node_modules
```

From `sb-stack-v1/`, each script is an Nx target: `pnpm nx run @acme/server:typecheck`. Run `pnpm db:migrate` at the repo root first (creates the `post` table); root `pnpm dev` runs server + web + expo in parallel.

## Boot sequence (`src/index.ts`)

1. `import "varlock/auto-load"` — loads the gitignored `.env.local` **before** any env read.
2. **Production fail-fast guards** (spec 20): exit non-zero if `NODE_ENV=production` and `AUTH_SECRET` is unset or still the `local-dev-placeholder-not-for-prod`, or if `BETTER_AUTH_URL` is unset / points at `http://localhost`.
3. `initDb()` (MikroORM) → `initAuth()` (better-auth, `trustedOrigins: ["expo://", ...CORS_ORIGINS]`) → `createApp({ auth, orm, corsOrigins }).listen(ENV.PORT)`.

## Where logic lives — do NOT put it in this app

- Routes + hardening (`GET /healthz`, `/swagger`, `/api/posts*`, rate limit, security headers, CORS) → `packages/api` (`createApp` factory; also exports `App` for Eden and `resetRateLimit` for tests).
- Auth (better-auth on `node:sqlite`, email & password, the Expo plugin, its own migrations) → `packages/auth`.
- Database (MikroORM 7 + Kysely escape hatch, SQLite file from `getDatabasePath()`) → `packages/db`.

## Env

Declared in the repo-root `.env.schema` and re-exported here (`@import(../../, pick=[...])`): `DATABASE_URL`, `BETTER_AUTH_URL`, `PORT`, `AUTH_SECRET`, `CORS_ORIGINS`.

- Read env via `import { ENV } from "varlock/env"` — **never `process.env`**: the `restrictEnvAccess` lint rule (from `@acme/eslint-config/base`) errors on `process.env` to keep values validated and typed. `src/index.ts` uses `Bun.env.NODE_ENV` only for the guards. `test/**` is exempt.
- `CORS_ORIGINS` is a comma-separated list.

## Testing

Repo rule: **no unit tests** — integration/e2e only. `bun test` runs `test/auth-flow.test.ts`, which builds a real `createApp`/`initAuth` against a temp SQLite DB and **must send an `origin` header** (`http://localhost:3001`) — better-auth's origin/CSRF middleware rejects cookie-bearing POSTs without a trusted Origin (spec 12 divergence 2).
