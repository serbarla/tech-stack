# Spec 02 — Phase B: Database, Drizzle → MikroORM + Kysely on `node:sqlite`

- Source: `NX_ELYSIA_SOLID_MIGRATION_PLAN.md` → `### Phase B`.
- Depends on: spec 01 (Nx owns targets; catalog has `@mikro-orm/core`, `@mikro-orm/sql`, `@mikro-orm/migrations`, `kysely`).
- Repo root: `create-t3-turbo/`. All paths/commands relative to it.
- Result carried forward: `@acme/db` exports `initDb()`, `getOrm()`, `getKysely()`, `Post`; migrations run through the MikroORM CLI; no Drizzle left anywhere.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Delete every Drizzle artifact — requirements: remove `packages/db/drizzle.config.ts`, `packages/db/src/schema.ts`, `packages/db/src/auth-schema.ts`, and `packages/db/src/client.ts` (imports `@vercel/postgres` + `drizzle-orm/vercel-postgres`); commands: `rm -f packages/db/drizzle.config.ts packages/db/src/schema.ts packages/db/src/auth-schema.ts packages/db/src/client.ts`

- [x] 2. Rewrite `packages/db/package.json` — requirements:
  - `dependencies`: remove `@vercel/postgres`, `drizzle-orm`, `drizzle-zod`, `zod`; add `@mikro-orm/core: catalog:`, `@mikro-orm/sql: catalog:`, `kysely: catalog:`;
  - `devDependencies`: remove `drizzle-kit`; add `@mikro-orm/migrations: catalog:` and `@mikro-orm/cli: catalog:` (the `mikro-orm` binary ships only in `@mikro-orm/cli`; without it the new scripts cannot run);
  - `scripts`: remove `push`, `studio`, `with-env`; add `"migration:create": "mikro-orm migration:create"` and `"migration:up": "mikro-orm migration:up"`; keep `build`, `clean`, `dev`, `format`, `lint`, `typecheck` exactly as they are;
  - commands: `pnpm install`

- [x] 3. Add `@mikro-orm/cli: ^7.2.5` to the `pnpm-workspace.yaml` catalog — requirements: single new catalog entry, no other catalog edits; commands: `pnpm install`

- [x] 4. Create the `Post` entity at `packages/db/src/entities/post.ts` — requirements: `defineEntity` (no decorators), table `post`, snake_case columns, `id` is the primary key; re-read the installed `@mikro-orm/core` 7.2 `defineEntity` property/hook spelling before writing and keep these names/types fixed:
  ```ts
  import { defineEntity } from "@mikro-orm/core";

  export const Post = defineEntity({
    name: "Post",
    tableName: "post",
    properties: {
      id: { type: "uuid", primary: true },
      title: { type: "string", length: 256 },
      content: { type: "text" },
      createdAt: { type: "datetime", onCreate: () => new Date() },
      updatedAt: { type: "datetime", onCreate: () => new Date(), onUpdate: () => new Date() },
    },
  });
  ```
  commands: `pnpm nx run @acme/db:typecheck`

- [x] 5. Rewrite `packages/db/src/index.ts` — requirements: lazy singleton `initDb()`, `getOrm()` that throws when uninitialized, `getKysely()` over the same connection, WAL enabled at init so better-auth and MikroORM can share the file, and no module-level DB open:
  ```ts
  import { MikroORM, NodeSqliteDialect, SqliteDriver } from "@mikro-orm/sql";
  import { Post } from "./entities/post";

  let orm: MikroORM | undefined;

  export async function initDb(): Promise<MikroORM> {
    const path = process.env.DATABASE_URL ?? "./sqlite.db";
    orm = await MikroORM.init({
      driver: SqliteDriver,
      driverOptions: new NodeSqliteDialect(path),
      entities: [Post],
      dbName: path,
    });
    await orm.em.getConnection().execute("PRAGMA journal_mode=WAL");
    return orm;
  }

  export function getOrm(): MikroORM {
    if (!orm) throw new Error("DB not initialized — call initDb() first");
    return orm;
  }

  export function getKysely() {
    return getOrm().em.getKysely();
  }

  export { Post };
  ```
  Empty/missing `DATABASE_URL` defaults to `./sqlite.db` — never throw for a missing env var; commands: `pnpm nx run @acme/db:typecheck`

- [x] 6. Add the CLI config at `packages/db/mikro-orm.config.ts` — requirements: reuses the same options; `driverOptions` is a factory because the CLI loads the file before env is guaranteed; confirm the exact `defineConfig` signature exported by `@mikro-orm/sql` 7.2 before writing:
  ```ts
  import { defineConfig, NodeSqliteDialect, SqliteDriver } from "@mikro-orm/sql";
  import { Post } from "./src/entities/post";

  export default defineConfig({
    driver: SqliteDriver,
    driverOptions: () => new NodeSqliteDialect(process.env.DATABASE_URL ?? "./sqlite.db"),
    entities: [Post],
    dbName: process.env.DATABASE_URL ?? "./sqlite.db",
    migrations: { path: "./src/migrations", pathTs: "./src/migrations" },
  });
  ```
  commands: `pnpm nx run @acme/db:migration:create`

- [x] 7. Fix `packages/db` exports — requirements: keep the `types: ./dist/index.d.ts` / `default: ./src/index.ts` pattern for `.`; delete the now-dangling `./client` and `./schema` exports; add `"./mikro-orm.config"` only if the CLI needs it (it resolves the config file by name in the project root, so normally it does not); commands: `pnpm nx run @acme/db:build`

- [x] 8. Create the initial migration — requirements: `post` table with `id text pk`, `title text not null`, `content text not null`, `created_at datetime`, `updated_at datetime` (snake_case); the migration file lives in `packages/db/src/migrations/` and uses `await this.addSql('create table "post" (...)');`; rename the generated class to a stable name if the CLI emits a timestamp-only one; commands:
  ```
  pnpm db:migration:create
  pnpm db:migrate
  ```

- [x] 9. Smoke the driver contract under Bun and prove the schema — requirements: `node:sqlite` `DatabaseSync` works on the Bun runtime version in use, the migration produced the expected columns, Kysely reads through `getKysely()`; commands:
  ```
  bun -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync(":memory:"); db.exec("create table t (id text)"); console.log(db.prepare("select name from sqlite_master").all());'
  sqlite3 sqlite.db '.schema post'
  ```

## 2. No-go

- No better-auth table work, no `packages/auth` edits, no auth migration files (spec 03).
- No `@acme/api` / route work (spec 04) and no server bootstrap (spec 05).
- Do not keep `drizzle-orm`, `drizzle-zod`, `drizzle-kit`, `@vercel/postgres` as transitive re-exports, compat shims, or commented-out code.
- Do not add a second DB file, a connection pool, a `client.ts`, or module-level `new DatabaseSync(...)` in `@acme/db` (better-auth opens its own in spec 03).
- Do not seed rows, add repositories, or model users/sessions in MikroORM.
- Do not add unit tests or fixtures.
- Do not touch `pnpm-workspace.yaml` beyond the `@mikro-orm/cli` entry.

## 3. Testing criteria

- [x] `pnpm install` exits 0 and `pnpm why drizzle-orm` prints nothing. (lockfile was refreshed once with `pnpm install --no-frozen-lockfile`; plain `pnpm install` exits 0 after that)
- [x] `pnpm typecheck` exits 0 (`@acme/db` builds before dependents). — CLEARED 2026-10-23 by spec 04: `@acme/api` no longer imports the removed `./client`, `./schema`, `desc`/`eq` exports. Cold run (`pnpm nx run-many -t typecheck lint --skip-nx-cache`) → 20 tasks, exit 0.
- [x] `pnpm nx run @acme/db:build` exits 0 and `packages/db/dist/index.d.ts` exists.
- [x] `pnpm db:migrate` exits 0, creates `sqlite.db`, and `sqlite3 sqlite.db '.tables'` lists `post`; a second `pnpm db:migrate` is a no-op (exit 0). — the file is `packages/db/sqlite.db`, because Nx runs the target in the project directory.
- [x] `sqlite3 sqlite.db '.schema post'` prints `id`, `title`, `content`, `created_at`, `updated_at` with `id` as primary key.
- [x] `bun -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync(":memory:"); db.exec("create table t (id text)"); console.log(db.prepare("select name from sqlite_master").all());'` prints `[ { name: "t" } ]`-shaped output.
- [x] `bun -e 'process.env.DATABASE_URL = "./sqlite.db"; const { initDb, getKysely } = await import("./packages/db/src/index.ts"); await initDb(); console.log(await getKysely().selectFrom("post").selectAll().execute());'` prints `[]`. — executed from `packages/db` (import replaced by `./src/index.ts`), where `sqlite.db` lives. `PRAGMA journal_mode=WAL` confirmed via `sqlite3 ... 'pragma journal_mode;'` → `wal`.
- [x] `pnpm lint` and `pnpm format` exit 0. — CLEARED 2026-10-23 by spec 04: `@acme/api` now uses Elysia/Eden imports, so the error-typed Drizzle imports are gone. `pnpm lint` and `pnpm format` exit 0 workspace-wide (cold lint run: 10 tasks, exit 0).
- [x] `git status --short` shows deletions for `drizzle.config.ts`, `schema.ts`, `auth-schema.ts`, `client.ts`; `grep -rn "drizzle" packages tooling apps` (excluding `node_modules`/`.cache`) matches nothing — no Drizzle left anywhere, including `packages/auth` (which has since migrated off the drizzle adapter, spec 03).
- [x] every objective in section 1 is checked (divergences, if any, appended here).

### Divergences

1. ~~Workspace `typecheck`/`lint` stay red in `@acme/api` only~~ — **RESOLVED 2026-10-23 by spec 04**: `@acme/api` was rewritten to Elysia + Eden and no longer imports `@acme/db/client`, `@acme/db/schema`, or `desc`/`eq`. Cold runs of `pnpm nx run-many -t typecheck lint --skip-nx-cache` (20 tasks) and `pnpm format` exit 0 workspace-wide. Tracking file `specs/divergencies/02-B-api-typecheck-lint-red.md` removed. (Original state: `@acme/auth` had already gone green via spec 03; `@acme/db` was green for `typecheck`, `build`, `lint`, `format`.)
2. `MikroORM.init` 7.2.5 does not infer `SqlEntityManager` from `driver: SqliteDriver`, so `src/index.ts` passes `<SqliteDriver, SqlEntityManager<SqliteDriver>, [typeof Post]>` and types the singleton as `MikroORM<…>`. Exported names (`initDb`, `getOrm`, `getKysely`, `Post`) are unchanged, and `getKysely().selectFrom("post")` is typed against the entity.
3. `Migration.addSql()` is synchronous in 7.2.5; `await` trips `@typescript-eslint/await-thenable`, so the migration calls it synchronously. DDL matches the requirement (double-quoted identifiers, snake_case columns); the generated timestamp-only class/file was renamed `InitialMigration`.
4. `process` typing required `@types/node` (catalog) in `packages/db` devDependencies, beyond the dependency list enumerated in objective 2.
5. `packages/validators/src/index.ts` described `drizzle-zod`; the stale comment was reworded. When first written, `packages/auth` still used `drizzleAdapter`; it has since migrated to better-auth (spec 03), so there are now no `drizzle` matches in any tracked source.
6. `.gitignore` now also ignores `*.db[-journal|-wal|-shm]`, so the `sqlite.db` produced by objective 8 does not show up as an untracked file.
