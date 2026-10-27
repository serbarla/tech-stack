# Spec 09 — Phase I: Single-DB path resolver and backend wiring

- Source: `SINGLE_DATABASE_BACKEND_PLAN.md` → Steps 1–3.
- Depends on: specs 02/03 (MikroORM `@acme/db`, better-auth `@acme/auth` on `node:sqlite`), spec 05 (Elysia `apps/server`, sole `initAuth` caller).
- Repo root: `create-t3-turbo/`. All paths/commands relative to it.
- Result carried forward: `getDatabasePath()` resolves `DATABASE_URL` against the workspace root (default `data/sqlite.db`); `@acme/db` (ORM + migration CLI) and `@acme/auth` open that one resolved file, wired explicitly by the server. The `.env.schema` default still reads `./sqlite.db` until spec 10 flips it, so this spec's checks run with `DATABASE_URL=data/sqlite.db` on the command line (real boot env wins over the varlock schema default — `@dynamic=boot`).

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Create the canonical DB path resolver `packages/db/src/db-path.ts` — requirements: exports `getDatabasePath(): string`; resolves a relative `DATABASE_URL` against the monorepo root (found by walking up from the module directory until `pnpm-workspace.yaml` is present), so the migration CLI and the server resolve the same file regardless of cwd; absolute paths pass through unchanged; default when `DATABASE_URL` is unset/empty is `data/sqlite.db`; no existing equivalent (the current code reads `process.env.DATABASE_URL ?? "./sqlite.db"` in three places with different cwds); exact content:
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
  commands: `pnpm nx run @acme/db:typecheck`

- [x] 2. Use the resolver inside `@acme/db` — requirements: `packages/db/src/index.ts` adds `import { getDatabasePath } from "./db-path";`, replaces `const path = process.env.DATABASE_URL ?? "./sqlite.db";` inside `initDb()` with `const path = getDatabasePath();` (rest of `initDb` unchanged), and re-exports the resolver for the server (`export { getDatabasePath } from "./db-path";`); `packages/db/mikro-orm.config.ts` adds `import { getDatabasePath } from "./src/db-path";` and replaces BOTH raw-env literals — `new NodeSqliteDialect(process.env.DATABASE_URL ?? "./sqlite.db")` (inside `driverOptions`) and `dbName: process.env.DATABASE_URL ?? "./sqlite.db"` — with `getDatabasePath()`; commands: `pnpm nx run @acme/db:typecheck`

- [x] 3. Thread the resolved path into better-auth via the server — requirements: `packages/auth/src/index.ts` adds a required `databaseUrl: string;` to the `initAuth` options object type (alongside `baseUrl`, `productionUrl`, …), replaces `database: new DatabaseSync(process.env.DATABASE_URL ?? "./sqlite.db"),` with `database: new DatabaseSync(options.databaseUrl),`, and deletes the now-dead `// eslint-disable-next-line no-restricted-properties -- DATABASE_URL is shared with @acme/db, injected by varlock` comment directly above it; `apps/server/src/index.ts` changes `import { initDb } from "@acme/db";` to `import { getDatabasePath, initDb } from "@acme/db";` and adds `databaseUrl: getDatabasePath(),` to the `initAuth<BetterAuthPlugin[]>({ ... })` options object — the only `initAuth` caller, no other call sites; `@acme/auth` stays decoupled from `@acme/db` (no new package dependency — the server is the single composition point); commands: `pnpm typecheck`

## 2. No-go

- Do not touch `.env.schema`, `README.md`, `apps/web/package.json`, or the stray `sqlite.db*` files at the repo root, `apps/server/`, or `packages/db/` — spec 10 owns steps 4–6 (default flip, docs, client deps, stale-artifact cleanup).
- Do not add `@acme/db` as a dependency of `@acme/auth`.
- Do not change `Dockerfile.server` or `docker-compose.yml` — the absolute `ENV DATABASE_URL=/data/sqlite.db` passes through `getDatabasePath()` unchanged.
- Do not change ports, `DATABASE_URL` semantics beyond root-relative resolution, or the `node:sqlite` runtime choice.
- Do not add unit tests.
- Do not commit `.env`, secrets, `*.db*` files, or a `data/` directory.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `pnpm lint && pnpm format && pnpm typecheck` exit 0 (repo root).
- [x] objective 1 (cwd-independent resolution): `bun -e 'delete process.env.DATABASE_URL; const { getDatabasePath } = await import("./packages/db/src/db-path.ts"); console.log(getDatabasePath());'` from the repo root and the same with `./src/db-path.ts` from `packages/db` both print the identical absolute `…/create-t3-turbo/data/sqlite.db`; with `process.env.DATABASE_URL = "rel/x.db"` it prints `…/create-t3-turbo/rel/x.db`; with `process.env.DATABASE_URL = "/abs/x.db"` it prints `/abs/x.db`.
- [x] objective 2 (migration CLI writes the resolved file): `rm -f data/sqlite.db data/sqlite.db-shm data/sqlite.db-wal && DATABASE_URL=data/sqlite.db pnpm db:migrate` exits 0 and recreates `data/sqlite.db` (fresh-file proof; gitignored dev artifact, recreated here per the plan's contingency), then `bun -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("data/sqlite.db", { readOnly: true }); console.log(db.prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name").all("table"));'` lists `mikro_orm_migrations` and `post`.
- [x] objective 3 (auth + server share that file): `DATABASE_URL=data/sqlite.db pnpm --filter @acme/server start` (leave running; from a second shell wait for `🦊 Elysia running at http://localhost:3000`), then re-run the objective-2 inspect → it now also lists `user`, `session`, `account`, `verification` — all tables in the single `data/sqlite.db`; `curl -s http://localhost:3000/api/posts` returns a JSON array served from `data/sqlite.db`; `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/protected` prints `401`. Stop the server afterwards.
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
`specs/divergencies/<file>.md`.**"). When the later spec lands and the checks
pass, mark the criteria `[x]` and remove the tracking file.*
