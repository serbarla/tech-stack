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

- [ ] 1. Add a `build` job to `.github/workflows/ci.yml` — requirements: runs `pnpm build` (root `nx run-many -t build`: `@acme/api`, `@acme/db`, `@acme/validators` tsc builds + `@acme/web` `vp build`); same checkout/setup steps as the other jobs; commands: `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'`

- [ ] 2. Add an `expo` job — requirements: smoke-build the mobile bundle without native tooling: `pnpm --filter @acme/expo exec expo export --platform ios` (JS bundle export, no signing, no simulator); contingency: if SDK 58 export rejects `ios` on CI, use `--platform web` (expo-router web build) and record it; commands: `pnpm --filter @acme/expo exec expo export --platform ios`

- [ ] 3. Add an `audit` job — requirements: `pnpm audit --audit-level high` fails the job on high/critical advisories; if the current tree has advisories, add `pnpm.overrides` pins for the fixable ones and record any unfixable remainder as a divergence with a tracking file; never silence with `--no-audit`; commands: `pnpm audit --audit-level high`

- [ ] 4. Add a secret-scan job — requirements: gitleaks on push/PR (`gitleaks/gitleaks-action@v2` with `GITHUB_TOKEN`); commit `.gitleaks.toml` allowlisting only the documented `local-dev-placeholder-not-for-prod` literal in `.env.schema` (it is a placeholder, not a secret) so the baseline is clean; real secrets fail; commands: `git ls-files | grep gitleaks` and a local `gitleaks detect --source . --no-git` run

## 2. No-go

- Do not build Docker images here (spec 19-S).
- Do not add Nx Cloud / distributed-cache requirements.
- Do not commit `expo export` output or any `dist/` artifacts.
- Do not silence audit findings globally; overrides must target specific advisories.
- Do not allowlist anything in gitleaks except the documented placeholder literal.

## 3. Testing criteria

*All boxes checked = spec done.*

- [ ] `pnpm build` exits 0 locally (same command the CI job runs).
- [ ] `pnpm --filter @acme/expo exec expo export --platform ios` exits 0 locally (or the recorded web-platform contingency).
- [ ] `pnpm audit --audit-level high` exits 0 (or overrides pin the advisories and the divergence/tracker records the rest).
- [ ] `gitleaks detect --source . --no-git` reports nothing except the allowlisted placeholder.
- [ ] `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'` prints `ok`; the file contains `build`, `expo`, `audit`, and secret-scan jobs.
- [ ] every objective in section 1 is checked.

## 4. Divergences

*REQUIRED at the end of every spec. If reality diverged from this spec while
executing it, append a numbered entry here — do not silently drop it and do not
edit the objectives to match what you actually did. Each entry: what diverged,
why, the fix attempt(s), and (if unresolved) a pointer to a tracking file. Keep
the `- [ ]` testing-criteria box unchecked and note the divergence inline next
to it, exactly as in `specs/02-B-database-drizzle-to-mikroorm-kysely.md`.*

- [ ] every divergence found is appended below (or the section reads "None.")

*Format (one numbered item per divergence):*

1. <what diverged and its current state> — <why it could not be done as
   written, citing the No-go rule or spec that blocks it> (Verified <date>:
   <N> fix attempts — <attempt 1>, <attempt 2>, <attempt 3> — all fenced by
   <constraint>; <impact> is deferred to <later spec> by design, not a defect.)

### Divergences

None yet — to be filled in at execution time.

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
