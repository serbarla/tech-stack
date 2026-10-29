# Spec 28 — Phase AB: Template hygiene and dependency cleanup

- Source: sb-stack-v1 release audit (2026-10-29), dead-weight items.
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: no t3-env/Next/TanStack/hbs template residue, no phantom cache outputs or no-op config, real font stacks, consistent migration idempotency, and no unused dependencies.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Delete `apps/expo/src/utils/session-store.ts` — requirements: verify zero importers first (`grep -rn "session-store" apps/expo/src`), then delete (zero importers; mixes sync `getItem`/`setItem` with async `deleteItemAsync` — an adopter trap); commands: grep, delete file
- [x] 2. Delete `apps/expo/.expo-shared/` — requirements: stale pre-SDK-49 dir; add `.expo-shared/` to `.gitignore`'s expo section; commands: delete dir, edit `.gitignore`
- [x] 3. Clean `tooling/prettier/index.js` — requirements: remove the Next.js import-order group and the `*.json.hbs`/`*.ts.hbs` parser overrides (no Next app, zero `.hbs` files); commands: edit `tooling/prettier/index.js`
- [x] 4. Clean `.vscode/settings.json` — requirements: remove TanStack `routeTree.gen.ts` watcher/readonly excludes and the `next/router.d.ts` autoImport exclude (template leftovers — this repo uses `virtual:file-routes`); commands: edit `.vscode/settings.json`
- [x] 5. Reword restrict-env rule messages — requirements: `tooling/eslint/base.ts:8-35` from t3-env wording (`import { env } from '~/env'`) to this repo's mechanism (`import { ENV } from "varlock/env"`); commands: edit `tooling/eslint/base.ts`
- [x] 6. Drop phantom nx outputs — requirements: `nx.json`: drop the `outputs` entries on `lint`/`format` targets (`.cache/.eslintcache`, `.cache/.prettiercache` — the scripts run eslint/prettier without `--cache`); commands: edit `nx.json`
- [x] 7. Delete the no-op `minimumReleaseAgeExclude` block — requirements: `pnpm-workspace.yaml` (no `minimumReleaseAge` is set anywhere — no-op config); commands: edit `pnpm-workspace.yaml`
- [x] 8. Real font stacks — requirements: `tooling/tailwind/theme.css:135-136` + `theme-native.css:160-161`: `--font-sans`/`--font-mono` reference undefined `--font-geist-*` vars → set `ui-sans-serif, system-ui, sans-serif` / `ui-monospace, monospace`; commands: edit `tooling/tailwind/theme.css`, `tooling/tailwind/theme-native.css`
- [x] 9. Fix issue-template contact links — requirements: `.github/ISSUE_TEMPLATE/config.yml:2-7`: contact links point at `/discussions`; "feature request" wording matches its link; commands: edit `.github/ISSUE_TEMPLATE/config.yml`
- [x] 10. Remove unused dependencies — requirements: remove `kysely` from `packages/db` (never imported; `@mikro-orm/sql` bundles its own), `zod` from `packages/api` (only `@acme/validators` imports it), `@elysiajs/eden` devDep from `packages/api` (web/expo declare their own), `elysia` from `apps/server` (never imported there); sync: `pnpm install --no-frozen-lockfile` (CI=true forces frozen; same as spec 10-J divergence 1), then `pnpm install --frozen-lockfile` exits 0; commands: edit package.jsons, `CI=false pnpm install --no-frozen-lockfile`
- [x] 11. Idempotent post migration — requirements: `packages/db/src/migrations/InitialMigration.ts:7`: add `if not exists` to the `post` DDL (parity with `AuthTablesMigration`'s idempotent style); commands: edit `packages/db/src/migrations/InitialMigration.ts`
- [x] 12. Keep deliberately (template API/demo surface) — requirements: no action; `getOrm`/`getKysely` exports (`packages/db/src/index.ts`), `Session` export (`packages/auth`), users.json + `/users` routes, Counter/logo, the web vitest stack stay; commands: none

## 2. No-go

- Do not remove the kept demo/API surface listed in objective 12.
- Do not upgrade any dependency while removing the unused ones.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `grep -rn "session-store" apps/expo/src` prints nothing.
- [x] `grep -rn "geist\|routeTree\|next/router\|hbs" tooling .vscode` prints nothing.
- [x] `pnpm install --frozen-lockfile` exits 0.
- [x] `pnpm db:migrate` on an already-migrated DB exits 0 (idempotence).
- [x] Cross-cutting gates: `pnpm lint && pnpm format && pnpm typecheck && pnpm build`, `pnpm --filter @acme/server test`, `pnpm --filter @acme/web e2e` all exit 0.
- [x] every objective in section 1 is checked.

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
`specs/divergencies/<file>.md`**"). When the later spec lands and the checks
pass, mark the criteria `[x]` and remove the tracking file.*
