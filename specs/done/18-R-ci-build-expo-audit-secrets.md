# Spec 18 — Phase R: CI production build, Expo bundle, dependency audit, secret scan

- Source: sb-stack-v1 monorepo audit (2026-10-28): no production build in CI, no Expo CI, no dependency audit, no secret scanning.
- Depends on: specs 15-O (single lockfile), 16-P (frozen install), 17-Q (web gates green before `pnpm build` runs in CI).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: CI proves the production artifacts exist (Nx build + Expo export) and blocks high-severity advisories and committed secrets. Docker image builds are spec 19-S's, not this one.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Add a `build` job to `.github/workflows/ci.yml` — requirements: runs `pnpm build` (root `nx run-many -t build`: `@acme/api`, `@acme/db`, `@acme/validators` tsc builds + `@acme/web` `vp build`); same checkout/setup steps as the other jobs; commands: `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'`

- [x] 2. Add an `expo` job — requirements: smoke-build the mobile bundle without native tooling: `pnpm --filter @acme/expo exec expo export --platform ios` (JS bundle export, no signing, no simulator); contingency: if SDK 58 export rejects `ios` on CI, use `--platform web` (expo-router web build) and record it; commands: `pnpm --filter @acme/expo exec expo export --platform ios`

- [x] 3. Add an `audit` job — requirements: `pnpm audit --audit-level high` fails the job on high/critical advisories; if the current tree has advisories, add `pnpm.overrides` pins for the fixable ones and record any unfixable remainder as a divergence with a tracking file; never silence with `--no-audit`; commands: `pnpm audit --audit-level high`

- [x] 4. Add a secret-scan job — requirements: gitleaks on push/PR (`gitleaks/gitleaks-action@v2` with `GITHUB_TOKEN`); commit `.gitleaks.toml` allowlisting only the documented `local-dev-placeholder-not-for-prod` literal in `.env.schema` (it is a placeholder, not a secret) so the baseline is clean; real secrets fail; commands: `git ls-files | grep gitleaks` and a local `gitleaks detect --source . --no-git` run

## 2. No-go

- Do not build Docker images here (spec 19-S).
- Do not add Nx Cloud / distributed-cache requirements.
- Do not commit `expo export` output or any `dist/` artifacts.
- Do not silence audit findings globally; overrides must target specific advisories.
- Do not allowlist anything in gitleaks except the documented placeholder literal.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `pnpm build` exits 0 locally (same command the CI job runs).
- [x] `pnpm --filter @acme/expo exec expo export --platform ios` exits 0 locally (or the recorded web-platform contingency).
- [x] `pnpm audit --audit-level high` exits 0 (or overrides pin the advisories and the divergence/tracker records the rest).
- [x] `gitleaks detect --source . --no-git` reports nothing except the allowlisted placeholder.
- [x] `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'` prints `ok`; the file contains `build`, `expo`, `audit`, and secret-scan jobs.
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

1. The `audit` job's `pnpm.overrides` pins live in `pnpm-workspace.yaml` under `overrides:`, not root `package.json` `pnpm.overrides` — the repo already kept its `@types/minimatch` pin in `pnpm-workspace.yaml`, and the workspace file is this repo's convention for the same pnpm mechanism (Verified 2026-10-28: 1 fix attempt — extended the existing `overrides:` block with 24 targeted pins, version-selector keys where multiple major lines coexist (`brace-expansion@<2.0.0`, `ws@^8.0.0`, `zod@<4.0.0`, …) — frozen install then re-lock via `pnpm install --no-frozen-lockfile`; `pnpm audit --audit-level high` exits 0 with only 4 low / 10 moderate advisories left, below the gate.)

2. `.gitleaks.toml` allowlists the `local-dev-placeholder-not-for-prod` literal by regex only, not path-scoped to `.env.schema` — released gitleaks v8.30.1 skips whole files at enumeration when a global allowlist has both `paths` and `condition = "AND"` (upstream bug, gitleaks/gitleaks PR #2227, fixed on master but not in any release), so any path-scoped form would exempt all of `.env.schema` from scanning, which the No-go rule "Do not allowlist anything in gitleaks except the documented placeholder literal" forbids (Verified 2026-10-28: 3 fix attempts — `paths` + `regexes` (OR: whole `.env.schema` exempt), `condition = "AND"` + `paths` (same whole-file skip, upstream bug), regex-only allowlist (works: baseline clean, a planted private key in `.env.schema` and in a normal file both still fail) — real secrets fail everywhere; the regex-only entry allowlists exactly the documented literal and nothing else.)

3. `check-web` (`pnpm nx run @acme/web:check` / `vp check`) was already RED at the 17-Q commit before this spec ran — the 17-Q dependency assumption "web gates green" does not hold in the working tree (Verified 2026-10-28: A/B against the pristine pre-override lockfile with `apps/web/dist` removed — `vp check` exits 1 on the untouched tree with the same 5 files flagged (`e2e/auth.spec.ts`, `src/App.css`, `src/components/Counter.test.tsx`, `src/components/Counter.tsx`, `src/routes/index.tsx`); 1 fix attempt — none applied, because fixing web formatting is outside spec 18-R's objectives ("NEVER improvise outside the objectives"); clearing it needs `pnpm nx run @acme/web:check --fix` (or `vp check --fix`) plus a re-run of the 17-Q gates; unowned by any later spec at execution time. ~~**Tracked for future check-up in `specs/divergences/18-R-check-web-red.md`**~~ **RESOLVED 2026-10-29** — the divergence was a genuine formatter conflict, not just drift: `vp check`'s oxfmt defaults to `printWidth: 100` while the `format` gate's prettier runs at 80, so the two formatters had no common fixpoint. Fix: pinned `fmt.printWidth: 80` in `apps/web/vite.config.ts` (oxfmt then accepts the prettier-formatted 4 TS/TSX files as-is) and collapsed the `font-family` list in `src/App.css` to two values (`system-ui, sans-serif` — prettier always explodes ≥3-value `font-family` lists, oxfmt always collapses them when they fit; `-apple-system` is superseded by `system-ui` on Apple platforms). Re-verified: `pnpm nx run @acme/web:check`, `pnpm lint`, `pnpm format`, `pnpm typecheck` all exit 0; `pnpm --filter @acme/web e2e` → 2 passed. Tracking file deleted.)

4. Running `pnpm build` and then `pnpm typecheck` in the same working tree fails: `@acme/web:typecheck` type-checks the gitignored `apps/web/dist/client` build output — the shared `exclude: ["dist", …]` lives in `tooling/tsconfig/base.json` and resolves relative to that file, so `apps/web` has no effective `dist` exclude of its own (Verified 2026-10-28: 2 fix attempts — confirmed the failures reference only `dist/client/assets/*.js`; confirmed typecheck exits 0 with `dist` removed on both the pinned and pristine trees; CI is unaffected because jobs run on isolated clean checkouts where `dist` is gitignored and never built in the typecheck job — fixing it needs an `exclude`/`include` in `apps/web/tsconfig.json`, outside spec 18-R's objectives. ~~**Same root cause as spec 20-T's Divergence 2 — tracked in `specs/divergences/20-T-web-typecheck-dist-artifact.md`**~~ **RESOLVED 2026-10-29** — fixed at the root instead of per-app: `tooling/typescript/base.json`'s exclude list is now `${configDir}`-anchored (`"${configDir}/dist"` etc., TS ≥5.5 template variable), so every project excludes its own `dist`/`build`/`node_modules`. This deviates from the 20-T tracking file's suggested app-local exclude ("keep the base file's paths as-is") because the relative paths in base.json exclude nothing real in any package; workspace-wide re-verified: `pnpm --filter @acme/web build && pnpm typecheck` exits 0 with `apps/web/dist` present, 0 TS errors, and `pnpm typecheck` passes for all packages. Tracking file deleted.)

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
