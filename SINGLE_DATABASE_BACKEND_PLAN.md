# Consolidate to a single SQLite database owned by the backend

## Context

The repo currently resolves `DATABASE_URL` as a CWD-relative `./sqlite.db`, so three processes write three different files: the migration CLI (cwd `packages/db`) writes `packages/db/sqlite.db`, the server (cwd `apps/server`) writes `apps/server/sqlite.db`, and root invocations write `./sqlite.db`. Better-auth (`@acme/auth`) opens `process.env.DATABASE_URL` in the server process but MikroORM (`@acme/db`) opens the same env in a different cwd, so migrations and auth tables can land in different files. End state: exactly one SQLite file at `data/sqlite.db` (the repo-root `data/` dir, already gitignored and already the Docker volume target), opened only by the backend (Elysia `apps/server` via `@acme/db` + `@acme/auth`); web/expo keep talking to it over HTTP through Eden treaty / better-auth client. Web also carries `@acme/api` (which transitively pulls `@acme/db`) as a production dependency despite importing it type-only — fix that leak.

## Approach

### Step 1 — Canonical DB path resolver (new file)

Create `packages/db/src/db-path.ts` exporting `getDatabasePath(): string`. It resolves a relative `DATABASE_URL` against the monorepo root (found by walking up from the module directory until `pnpm-workspace.yaml` is present), so the migration CLI and the server resolve the same file regardless of cwd; absolute paths pass through unchanged. Default when `DATABASE_URL` is unset/empty is `data/sqlite.db`.

Exact content:

```ts
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function findWorkspaceRoot(): string {
  let dir = MODULE_DIR;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  // Unreachable in this repo (pnpm-workspace.yaml exists at root); safe fallback.
  return resolve(MODULE_DIR, "../../..");
}

const DEFAULT_DATABASE_URL = "data/sqlite.db";

export function getDatabasePath(): string {
  const raw = process.env.DATABASE_URL;
  const configured =
    raw && raw.trim() !== "" ? raw.trim() : DEFAULT_DATABASE_URL;
  return isAbsolute(configured)
    ? configured
    : resolve(findWorkspaceRoot(), configured);
}
```

No existing equivalent exists: the current code reads `process.env.DATABASE_URL ?? "./sqlite.db"` in three places with different cwds.

### Step 2 — Use the resolver in `@acme/db`

- `packages/db/src/index.ts`:
  - Add `import { getDatabasePath } from "./db-path";`
  - In `initDb()`, replace `const path = process.env.DATABASE_URL ?? "./sqlite.db";` with `const path = getDatabasePath();` (keep the rest of `initDb` unchanged).
  - Re-export for the server: add `export { getDatabasePath } from "./db-path";` (or `export { getDatabasePath };` if imported by value).
- `packages/db/mikro-orm.config.ts`:
  - Add `import { getDatabasePath } from "./src/db-path";`
  - Replace `new NodeSqliteDialect(process.env.DATABASE_URL ?? "./sqlite.db")` (inside `driverOptions`) with `new NodeSqliteDialect(getDatabasePath())`.
  - Replace `dbName: process.env.DATABASE_URL ?? "./sqlite.db"` with `dbName: getDatabasePath()`.

### Step 3 — Thread the resolved path into better-auth

- `packages/auth/src/index.ts`:
  - Add `databaseUrl: string;` to the `initAuth` options object type (make it required).
  - Replace the line `database: new DatabaseSync(process.env.DATABASE_URL ?? "./sqlite.db"),` with `database: new DatabaseSync(options.databaseUrl),`.
  - Delete the now-dead `// eslint-disable-next-line no-restricted-properties -- DATABASE_URL is shared with @acme/db, injected by varlock` comment directly above it.
- `apps/server/src/index.ts`:
  - Change `import { initDb } from "@acme/db";` to `import { getDatabasePath, initDb } from "@acme/db";`.
  - Add `databaseUrl: getDatabasePath(),` to the `initAuth<BetterAuthPlugin[]>({ ... })` options object (next to the other fields). Only one caller of `initAuth` exists (`apps/server/src/index.ts`); no other callers to update.

Keeps `@acme/auth` decoupled from `@acme/db` (no new package dependency); the server is the single composition point that wires both.

### Step 4 — Update default env + docs to `data/sqlite.db`

- Root `.env.schema`: change line `DATABASE_URL=./sqlite.db` to `DATABASE_URL=data/sqlite.db`. Leave the comment above it; the `@type=string @sensitive=false @dynamic=boot` line stays.
- `README.md`: two spots — the Quick Start note (line ~71, "default `./sqlite.db`") and the env table row (line ~100, "`./sqlite.db` locally, `/data/sqlite.db` in Docker"). Change both local mentions to `data/sqlite.db`. Do not change the Docker mention (`/data/sqlite.db`).

Docker is unaffected: `Dockerfile.server` sets absolute `ENV DATABASE_URL=/data/sqlite.db`, which `getDatabasePath()` passes through as-is, and `docker-compose.yml` already mounts `./data:/data`.

### Step 5 — Remove client-side runtime dependency on backend code

- `apps/web/package.json`: move `"@acme/api": "workspace:*"` out of `dependencies` into `devDependencies` (insert before `"@acme/tsconfig"`). The only usage is `import type { App } from "@acme/api"` in `apps/web/src/lib/api.ts` (type-only, erased at build), so it belongs in devDependencies — exactly how `apps/expo/package.json` already declares it. `@acme/validators` and `better-auth` (client) stay in `dependencies`.
- Run `pnpm install` to sync the `pnpm-lock.yaml` importer entry (moves the workspace link from the web importer's `dependencies` to `devDependencies`; no version changes).

### Step 6 — Remove stale SQLite artifacts

Delete the gitignored runtime DB files that are now unreachable (all `*.db*` are gitignored):
- root `sqlite.db`, `sqlite.db-shm`, `sqlite.db-wal`
- `apps/server/sqlite.db`, `apps/server/sqlite.db-shm`, `apps/server/sqlite.db-wal`
- `packages/db/sqlite.db`

Keep `data/sqlite.db` (and its `-shm`/`-wal`) — it is now the canonical file and will be migrated in Verification. If `data/sqlite.db` is absent, `pnpm db:migrate` recreates it.

## Critical files & anchors

- `packages/db/src/index.ts` — `initDb()` builds the MikroORM config inline; must resolve via `getDatabasePath()`.
- `packages/db/mikro-orm.config.ts` — migration CLI entry; `driverOptions` and `dbName` both hardcode the raw env default.
- `packages/auth/src/index.ts` — `initAuth()` opens `node:sqlite` on the raw env default; must take the resolved `databaseUrl`.
- `apps/server/src/index.ts` — sole caller wiring `initDb` + `initAuth`; sole place to pass `databaseUrl`.
- `apps/web/package.json` — `@acme/api` currently under `dependencies`; the type-only import makes it a devDependency.

## Verification

Run from repo root (`/Users/sergiobarba/orca/projects/tech-stack/create-t3-turbo`). Bun is required for the server and inspection.

1. **Typecheck all packages**: `pnpm typecheck` — passes with no errors.
2. **Single-file migration**: `pnpm db:migrate`, then confirm the `post` table exists in `data/sqlite.db` and no other file was created:
   ```bash
   bun -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("data/sqlite.db", { readOnly: true }); console.log(db.prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name").all("table"));'
   ls sqlite.db apps/server/sqlite.db packages/db/sqlite.db  # each: "No such file or directory"
   ```
   Expected: output lists `mikro_orm_migrations` and `post`; the `ls` reports all three as missing.
3. **Server writes auth tables to the same file**: start the server `pnpm --filter @acme/server start` (blocks; leave running), wait for the log line `🦊 Elysia running at http://localhost:3000`, then re-run the Step 2 `bun -e ...` inspect from a second shell. Expected: `post` + `mikro_orm_migrations` + better-auth tables (`user`, `session`, `account`, `verification`) all in `data/sqlite.db`. Stop the server.
4. **End-to-end API smoke over HTTP** (proves backend-only access): with the server running, `curl -s http://localhost:3000/api/posts` returns a JSON array (empty or existing posts) served from `data/sqlite.db`; `curl -s http://localhost:3000/api/protected` returns `401` (auth gate intact). Stop the server.
5. **Client no longer depends on backend at runtime**: `pnpm --filter @acme/web list --prod` — output must NOT include `@acme/api` or `@acme/db`. Then `pnpm nx run @acme/web:build` — web still builds with `@acme/api` as a devDependency (type-only import resolves).

## Assumptions & contingencies

- **Canonical location is `data/sqlite.db`** (repo-root `data/`, gitignored, already the Docker volume target). If the user instead wants the repo-root `sqlite.db`, change only two literals: `DEFAULT_DATABASE_URL` in `packages/db/src/db-path.ts` and the `DATABASE_URL` value in root `.env.schema` (and the two README mentions); no structural change.
- **`data/sqlite.db` is safe to keep**: it is a gitignored dev artifact; migrations are idempotent, so re-running `pnpm db:migrate` on an already-migrated file is a no-op. If `data/sqlite.db` is found to be corrupt/partial during Step 2, delete `data/sqlite.db*` and re-run `pnpm db:migrate` (better-auth tables are recreated at next server boot by `initAuth`).
- **Workspace-root detection**: the resolver walks up to `pnpm-workspace.yaml`. If the server is ever bundled into a different layout (not today — it runs `bun apps/server/src/index.ts` unbundled), the `../../..` fallback may no longer equal the repo root; re-point `findWorkspaceRoot()` at the new layout marker at that time.
