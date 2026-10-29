# Spec 13 — Phase M: Auth tables under `pnpm db:migrate`

- Source: `BETTER_AUTH_EMAIL_PASSWORD_PLAN.md` → `### Phase 3`.
- Depends on: spec 12 (mandatory predecessor — the DDL is captured from the final auth config with `emailAndPassword` enabled), spec 02 (`Migration` subclass shape, `pnpm db:migrate`), specs 09/10 (`getDatabasePath()`).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: the four better-auth tables (`user`, `session`, `account`, `verification`) and their indexes are created by `packages/db/src/migrations/AuthTablesMigration.ts` under `pnpm db:migrate`; `packages/auth` no longer runs better-auth's boot-time `getMigrations(...).runMigrations()` (a fresh unmigrated DB logs better-auth's "Database schema mismatch" until migrated); no MikroORM entities exist for the auth tables — better-auth's own adapter owns them and `mikro-orm.config.ts`/`initDb()` entities stay `[Post]`.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Capture the auth DDL from the installed better-auth (NEVER hand-invent columns) — requirements: from `packages/auth` (so `better-auth` resolves) run the throwaway probe against a temp file:
  ```sh
  rm -f /tmp/auth-schema-probe.db*
  cd packages/auth
  bun -e '
  import { DatabaseSync } from "node:sqlite";
  const { getMigrations } = await import("better-auth/db/migration");
  const config = { database: new DatabaseSync("/tmp/auth-schema-probe.db"), baseURL: "http://localhost:3000", secret: "probe", emailAndPassword: { enabled: true } };
  const m = await getMigrations(config);
  console.log("PROBLEMS", JSON.stringify(m.schemaProblems));
  await m.runMigrations();
  const db = new DatabaseSync("/tmp/auth-schema-probe.db", { readOnly: true });
  for (const row of db.prepare("select type, name, sql from sqlite_master where sql is not null and name not like 'sqlite_%' order by case type when 'table' then 0 else 1 end, name").all()) console.log("--", row.type, row.name, "\n" + row.sql + ";");
  '
  ```
  expect `PROBLEMS []` and exactly the four tables `account`, `session`, `user`, `verification` plus their indexes; take the DDL from `sqlite_master` (not `getMigrations().compileMigrations()`, whose `compile().sql` can contain `?` bind placeholders for static defaults) so the SQL is literal and sqlite-exact; the probe file is scratch — nothing from it is committed except the pasted SQL; contingencies: if the probe prints non-empty `PROBLEMS` or missing tables, STOP and append a divergence (never hand-write columns); if the `sqlite_master` dump somehow contains `?` placeholders, inline the literal values from `m.toBeCreated` field metadata and re-run the probe to compare; commands: the probe script above (run from `packages/auth`)

- [x] 2. Create `packages/db/src/migrations/AuthTablesMigration.ts` — requirements: copy the class shape of `InitialMigration` (`export class AuthTablesMigration extends Migration`, `override name = "AuthTablesMigration"`); `up()`: one `this.addSql(...)` per captured statement, with every `create table` rewritten to `create table if not exists` and every `create index`/`create unique index` to `create ... index if not exists` (SQLite supports both) — `if not exists` makes the migration safe on dev DBs where the old boot-time better-auth migration already created the tables — and no other rewrite of the captured SQL; `down()`: `drop table if exists` in child-first order `"verification"`, `"account"`, `"session"`, `"user"` (indexes drop with their tables); NO MikroORM entities for these tables — better-auth's own adapter performs all reads/writes on them and entities would be dead metadata: `mikro-orm.config.ts` and `initDb()`'s `entities` stay `[Post]`, and future `migration:create` diffs stay entity-driven so the untracked tables are ignored (never dropped); migration order vs `InitialMigration` is irrelevant (disjoint tables); commands: `pnpm db:migrate`

- [x] 3. Stop migrating at boot in `packages/auth/src/index.ts` — requirements: delete the `getMigrations` import (`better-auth/db/migration`) and the `const { runMigrations } = ...; await runMigrations();` lines, and replace their comment block with exactly: `// Auth tables are created by packages/db migrations (pnpm db:migrate); run them before boot, same contract as the post table. A fresh unmigrated DB logs better-auth's "Database schema mismatch" until then.`; `initAuth` stays `async` with the same return type and signature; commands: `grep -n "getMigrations\|runMigrations" packages/auth/src/index.ts` (prints nothing)

## 2. No-go

- Do not hand-invent auth columns or edit the captured SQL beyond the `if not exists` rewrite — the probe output is the source of truth (on `PROBLEMS`/missing tables: stop and append a divergence).
- Do not add MikroORM entities for `user`/`session`/`account`/`verification` or touch `mikro-orm.config.ts`/`initDb()` entities (stay `[Post]`).
- Do not change better-auth config/behavior (spec 12 owns it) or the `initAuth` signature/return type.
- Do not drop or recreate pre-existing auth tables — `down()` exists for full rollback only.
- Do not add unit tests.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `pnpm lint && pnpm format && pnpm typecheck` exit 0 (repo root) (via the `require-await` disable on `initAuth` — Divergence 2).
- [x] Migration owns the schema (plan Verification 1): `rm -f data/sqlite.db data/sqlite.db-shm data/sqlite.db-wal && pnpm db:migrate` exits 0, then `bun -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("data/sqlite.db", { readOnly: true }); console.log(db.prepare("select name from sqlite_master where type = ? order by name").all("table").map(r => r.name));'` prints `account, mikro_orm_migrations, post, session, user, verification` (actual output also lists SQLite's internal `sqlite_sequence` — Divergence 1).
- [x] Boot is clean (plan Verification 2): with the DB from the previous check, `pnpm --filter @acme/server dev` logs `🦊 Elysia running at http://localhost:3000` and never logs `Database schema mismatch` or `BETTER AUTH API ERROR`; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/ok` → `200`.
- [x] Migration idempotence on pre-existing DBs (plan Verification 8): with a DB that already contains the auth tables (e.g. `data/sqlite.db` from before this change), `pnpm db:migrate` exits 0 without errors (`if not exists`); `up()`'s statements match objective 1's captured SQL modulo the `if not exists` rewrites.
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

1. Verification 1's table-list command prints `sqlite_sequence` in addition to the six expected tables — `sqlite_sequence` is SQLite's internal bookkeeping table, created automatically by the `AUTOINCREMENT` in MikroORM's own `mikro_orm_migrations` table (spec 02's runner), not by this migration; all six expected tables are present, so the criterion's intent is met. (Verified 2026-10-28: 0 fix attempts needed — internal table, filtered out by the spec's own probe query via `name not like 'sqlite_%'`.)
2. `packages/auth/src/index.ts` needed an `eslint-disable-next-line @typescript-eslint/require-await` on `initAuth` — after removing `await runMigrations()`, the async function has no `await` expression and `pnpm lint` fails, but the spec forbids changing the `initAuth` signature (which must stay `async`); the targeted disable reconciles both requirements without touching the signature. (Verified 2026-10-28: 2 fix attempts — first leaving the lint red, then the disable comment — fenced by the "initAuth stays async with the same return type and signature" no-go; no behavior impact.)

### Unresolved divergences → `specs/divergences/`

*A divergence that stays OPEN because a later spec owns the fix MUST also get a
tracking file in `specs/divergences/`, so future agents can find and clear it.
Name it `<spec-id>-<short-slug>.md` (e.g.
`02-B-api-typecheck-lint-red.md`). Include: source spec + the exact criteria it
blocks, what is broken (files/imports), why each fix attempt was fenced, and a
"how to clear it" checklist naming the spec that resolves it plus the commands
to re-verify. Then link the tracking file from the matching Divergence entry
above (e.g. "**Tracked for future check-up in
`specs/divergences/<file>.md`**"). When the later spec lands and the checks
pass, mark the criteria `[x]` and remove the tracking file.*
