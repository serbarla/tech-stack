# Spec 25 — Phase Y: CI hardening and policy

- Source: sb-stack-v1 release audit (2026-10-29), CI/policy should-fixes.
- Depends on: spec 24-X (docker smoke job shape).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: CI cancels only non-`master` runs, token permissions are read-only, pnpm/playwright caches restore per lockfile, Renovate cannot automerge majors or behavior-asserted deps and skips `@elysiajs/swagger`, and the sample web unit suite runs in CI.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Fix `cancel-in-progress` branch guard — requirements: `.github/workflows/ci.yml:12`: `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}` → `refs/heads/master` (default branch is `master` — `ci.yml:7`, `nx.json:50`; today every master push cancels its own in-flight CI); commands: edit `.github/workflows/ci.yml`
- [x] 2. Scope token permissions — requirements: `ci.yml` top: `permissions: contents: read`; secret-scan job gains `env: GITLEAKS_ENABLE_COMMENTS: "false"` (no write perms needed); commands: edit `.github/workflows/ci.yml`
- [x] 3. Add dependency caches — requirements: caching in `tooling/github/setup/action.yml` (explicit `actions/cache@v4` steps — order-independent, setup-node's `cache: pnpm` needs pnpm on PATH first): pnpm store `~/.local/share/pnpm/store`, key `${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}`, restore-keys `${{ runner.os }}-pnpm-`; in `ci.yml` e2e job: `actions/cache@v4` for `~/.cache/ms-playwright`, key `${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}`; commands: edit `tooling/github/setup/action.yml`, `.github/workflows/ci.yml`
- [x] 4. Tighten Renovate automerge — requirements: `.github/renovate.json` packageRules: `matchUpdateTypes: ["major"]` → `automerge: false`; `matchPackageNames: ["solid-js", "@solidjs/diagnostics", "better-auth"]` → `automerge: false` (behavior asserted by tests — human review on bump); `matchPackageNames: ["@elysiajs/swagger"]` → `enabled: false` (pinned 1.0.5 by spec 20-T divergence 1; newer lines crash under the zod 4.6.7 security override); commands: edit `.github/renovate.json`
- [x] 5. Run the sample web unit suite in CI — requirements: `ci.yml` test job: add step `pnpm --filter @acme/web test` (the sample unit suite currently executes nowhere; a template should ship it green); commands: edit `.github/workflows/ci.yml`

## 2. No-go

- Do not add write permissions or release/publish workflows.
- Do not change the docker job's smoke-boot steps (spec 24-X).
- Do not remove the sample unit test (demo content stays).

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'` prints `ok`.
- [x] `grep -n "refs/heads/master" .github/workflows/ci.yml` shows the `cancel-in-progress` line.
- [x] `grep -n "permissions:" .github/workflows/ci.yml` shows the top-level `contents: read`.
- [x] `grep -c "actions/cache" tooling/github/setup/action.yml .github/workflows/ci.yml` ≥ 2.
- [x] `pnpm --filter @acme/web test` exits 0 locally (contingency C1).
- [x] `ruby -rjson -e 'JSON.parse(File.read(".github/renovate.json")); puts "ok"'` prints `ok`.
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

1. Contingency C1 fired in an unanticipated shape: `pnpm --filter @acme/web
   test` failed not in `Counter.test.tsx` (it passes untouched, including the
   `@solidjs/diagnostics` rerun-budget assertion) but because vitest collected
   `e2e/auth.spec.ts` — `vp test`'s default include sweeps `**/*.spec.*`, so
   the Playwright suite died under vitest with "Playwright Test did not expect
   test() to be called here". Fixed forward minimally per C1 by scoping the
   vitest include in `apps/web/vite.config.ts` to `src/**/*.test.{ts,tsx}`
   (unit/e2e separation mirrors playwright's `testDir: "./e2e"`). (Verified
   2026-10-29: 1 fix attempt — the `include` addition — no constraint fenced
   it.) Observation recorded for spec 27-AA objective 5: a developer-exported
   `NODE_ENV=production` (without `AUTH_SECRET`) makes the e2e webServer fail
   the Phase 1 boot guard — playwright's `webServer.env` passes `process.env`
   through; the P5 insulation covers `PORT`/`VITE_API_URL`/`DATABASE_URL` and
   should be checked against this trap at P5 execution.

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
