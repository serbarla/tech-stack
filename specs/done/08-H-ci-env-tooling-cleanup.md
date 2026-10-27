# Spec 08 — Phase H: CI + env + tooling cleanup

- Source: `NX_ELYSIA_SOLID_MIGRATION_PLAN.md` → `### Phase H`.
- Depends on: specs 01–07 (all targets exist; `@acme/web:check` exists; server container verified).
- Repo root: `create-t3-turbo/`. All paths/commands relative to it.
- Result carried forward: CI installs Bun (for `vp`/server), runs Nx targets only, has no Turbo/Vercel env, and `.env.example` describes the SQLite + Elysia contract instead of Postgres.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Rewrite the composite setup action `tooling/github/setup/action.yml` — requirements: remove the `pnpm add -g turbo` step; add `oven-sh/setup-bun@v2` before install (for `vp` and the Bun apps); keep `pnpm/action-setup`, `actions/setup-node` (`node-version-file: ".nvmrc"`) and `pnpm install` in that order; commands: none

- [x] 2. Rewrite `.github/workflows/ci.yml` — requirements: drop `TURBO_TEAM` / `TURBO_TOKEN` (Vercel remote cache gone); optionally add `NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}` only if remote cache is actually used; keep `FORCE_COLOR`, triggers, and concurrency; jobs:
  - `lint`: `pnpm lint && pnpm lint:ws`
  - `format`: `pnpm format`
  - `typecheck`: `pnpm typecheck`
  - `check-web`: `pnpm nx run @acme/web:check`
  every job keeps `actions/checkout@v5`, `uses: ./tooling/github/setup`, and `cp .env.example .env` before its run step; commands: `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml")'`

- [x] 3. Rewrite `.env.example` for SQLite + Elysia — requirements: replace the `POSTGRES_URL` block with:
  ```
  # SQLite file path (node:sqlite). Local: ./sqlite.db ; Docker (server): /data/sqlite.db
  DATABASE_URL="./sqlite.db"
  # Public URL of the Elysia server (better-auth base URL)
  BETTER_AUTH_URL="http://localhost:3000"
  ```
  keep `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`; `VITE_API_URL="http://localhost:3000"` is already present from spec 05; no secrets, no `.env` committed; commands: `grep -E "DATABASE_URL|BETTER_AUTH_URL|VITE_API_URL" .env.example`

- [x] 4. Remove the last dead tooling — requirements: root `devDependencies` drop `dotenv-cli` (its only users were `@acme/db` `with-env` and the deleted `@acme/auth` `generate`); `.nvmrc` and `engines` stay (Node 22 for pnpm/tsc even though the apps run on Bun); confirm no `turbo` references remain in tracked config; commands:
  ```
  pnpm install
  grep -rn "turbo" package.json nx.json pnpm-workspace.yaml tooling .github || true
  ```

- [x] 5. Replay CI locally — requirements: the four job command groups pass from a clean-ish state; note that `pnpm lint`/`format`/`typecheck` are Nx `run-many` and must be green with the deleted apps absent:
  ```
  cp .env.example .env
  pnpm lint && pnpm lint:ws
  pnpm format
  pnpm typecheck
  pnpm nx run @acme/web:check
  ```

## 2. No-go

- Do not re-add Turborepo, `turbo` scripts, `TURBO_*` env, or Vercel remote cache.
- Do not add an Nx Cloud project/token requirement — the optional token only.
- Do not add CI jobs beyond `lint`, `format`, `typecheck`, `check-web` (no Docker build job, no E2E job, no unit-test job unless explicitly requested later).
- Do not commit `.env`, secrets, real Discord credentials, or a `data/` directory.
- Do not change ports, `DATABASE_URL` semantics, or the `node:sqlite` runtime choice.
- Do not add ESLint/Prettier to `apps/web` — CI uses `vp check` for it.
- Do not add unit tests.

## 3. Testing criteria

- [x] `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); YAML.load_file("tooling/github/setup/action.yml"); puts "ok"'` prints `ok` (or an equivalent YAML parse succeeds).
- [ ] `grep -rn "turbo" .github tooling/github package.json` prints nothing. — DIVERGENCE (divergence 1): the literal grep matches only the workspace-root package name `create-t3-turbo` (`package.json:2`) and the two upstream `t3-oss/create-t3-turbo` discussion URLs (`.github/ISSUE_TEMPLATE/config.yml:3,6`); a tree-wide scan and the refined grep find zero Turborepo scripts, env vars, dependencies, or config. The workspace name and upstream links are permanent, so this literal check cannot pass by design.
- [x] `grep -n "setup-bun" tooling/github/setup/action.yml` prints the Bun step.
- [x] `grep -n "check-web\|@acme/web:check" .github/workflows/ci.yml` prints the web job.
- [x] `cp .env.example .env && pnpm lint && pnpm lint:ws` exits 0 (10/10 lint tasks, sherif `✓ No issues found`).
- [x] `pnpm format` exits 0 (10/10 tasks; required the snapshot-ignore fix in divergence 2).
- [x] `pnpm typecheck` exits 0 (13/13 tasks).
- [x] `pnpm nx run @acme/web:check` exits 0 (4/4 tasks).
- [x] `grep -n "POSTGRES_URL" .env.example` prints nothing; `grep -n "DATABASE_URL\|BETTER_AUTH_URL\|VITE_API_URL" .env.example` prints all three (lines 8, 10, 22).
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

1. **`turbo` grep can never print nothing (false positives only).** The
   workspace-root package is literally named `create-t3-turbo`
   (`package.json:2`), and `.github/ISSUE_TEMPLATE/config.yml:3,6` link to the
   upstream `t3-oss/create-t3-turbo` discussions. Both predate this spec, are
   unrelated to the orchestrator, and were left as-is: renaming the workspace
   root is outside section 1, and the template URLs must keep pointing at the
   upstream repo. Verified 2026-10-23: a refined grep over tracked files
   (`git ls-files | xargs grep -nE '"turbo"|TURBO_|@turbo/gen|turbo run|turborepo|turbopack|turbo\.t3\.gg|\.turbo'`)
   returns nothing; the literal `turbo` grep matches only the branding hits
   above — zero Turborepo scripts, env vars, or dependencies. Dead `turbo`
   remnants removed in this pass: `.turbo` in every package `clean` script
   (`apps/expo`, `packages/{api,auth,db,ui,validators}`,
   `tooling/{eslint,prettier,tailwind}`), the `.gitignore` `.turbo` entry, and
   the dead Next.js/Turbopack `.vscode/launch.json` config (now `Nx dev`).
   Additional dead remnants removed 2026-10-23 on a tree-wide re-check: the
   `.turbo` entry in `.dockerignore` and the commented-out
   `// return "https://turbo.t3.gg";` fallback in
   `apps/expo/src/utils/base-url.ts`. Workspace `typecheck`/`lint`/`format`
   re-ran 30/30 exit 0. This repeats the false positive already recorded in
   spec 01-A; tracker removed.

2. **`pnpm format` was red on generated MikroORM snapshots, not on source.**
   `packages/db/src/migrations/.snapshot-sqlite.db.json` (regenerated after
   spec 03's exit-0 record) plus two `spec07-test[2]` leftovers failed Prettier
   (multiline `columnNames` arrays, missing trailing newline). Fixed here
   because objective 5 requires `pnpm format` green and no later spec owns the
   file: added `.snapshot-*.json` to `.gitignore` — the path `@acme/db`'s
   `prettier --check . --ignore-path ../../.gitignore` already consumes — so a
   future `migration:create`/`migration:up` cannot redden `pnpm format`, and
   deleted the two spec-07 test snapshots. Verified 2026-10-23:
   `pnpm format` 10/10, `pnpm typecheck` 13/13, `pnpm lint` 10/10. Cleared the
   (now-removed) spec-03 tracker `03-C-typecheck-lint-format-red.md` and
   re-checked that spec's two criteria. Re-verified 2026-10-23 on the current
   tree: `git check-ignore -v packages/db/src/migrations/.snapshot-sqlite.db.json`
   → `.gitignore:61:.snapshot-*.json`, `pnpm format --skip-nx-cache` → 10
   projects exit 0, `git status --short` shows no snapshot. Tracker removed.

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
