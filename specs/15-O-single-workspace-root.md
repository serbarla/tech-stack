# Spec 15 — Phase O: Single workspace root (remove nested web workspace)

- Source: sb-stack-v1 monorepo audit (2026-10-28), finding 1 (recommendation order item 1).
- Depends on: specs 01–14 (current tree; the e2e harness from 14-N must survive).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: exactly one tracked `pnpm-lock.yaml` and one `pnpm-workspace.yaml`, both at the repo root; `apps/web` installs only as part of the workspace and its nested lockfile drift (solid-js rc.17 vs root rc.18) is gone; the Solid release-age policy keeps working from the root config.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Move the Solid release-age policy to the root workspace file — requirements: root `pnpm-workspace.yaml` gains the `minimumReleaseAgeExclude` key currently only in `apps/web/pnpm-workspace.yaml`, listing exactly `solid-js`, `@solidjs/*`, `filesystem-routing` (keep the explanatory comment); commands: `grep -n "minimumReleaseAgeExclude" pnpm-workspace.yaml`

- [x] 2. Delete the nested workspace files and the standalone install tree — requirements: `git rm apps/web/pnpm-workspace.yaml apps/web/pnpm-lock.yaml`; also delete `apps/web/node_modules` (it belongs to the removed nested root and has no `.modules.yaml`); commands: `git rm apps/web/pnpm-workspace.yaml apps/web/pnpm-lock.yaml && rm -rf apps/web/node_modules`

- [x] 3. Reinstall from the single root — requirements: `pnpm install` at root succeeds and leaves the root `pnpm-lock.yaml` byte-identical in content (the root lock already resolves solid-js 2.0.0-rc.18, which the nested rc.17 lock had drifted from); `apps/web/node_modules` must NOT reappear standalone; commands: `pnpm install && git status --short`

- [x] 4. Prove the web app still works from the workspace install — requirements: the Playwright webServers (cwd `../..`, root-level commands) still boot server + web from the single install; the e2e suite passes; commands: `pnpm --filter @acme/web e2e`

## 2. No-go

- Do not change any dependency version, the pnpm catalog, or the resolved versions in the root lockfile.
- Do not touch `apps/web/package.json` scripts or deps (spec 17-Q owns that).
- Do not remove or rename `apps/web` itself.
- Do not switch package managers or re-add a nested `pnpm-lock.yaml`/`pnpm-workspace.yaml` anywhere.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `git ls-files | grep pnpm-lock.yaml` prints exactly `pnpm-lock.yaml` (one line).
- [x] `git ls-files | grep pnpm-workspace.yaml` prints exactly `pnpm-workspace.yaml` (one line).
- [x] `grep -n "minimumReleaseAgeExclude" pnpm-workspace.yaml` prints the policy at the root.
- [x] `pnpm install --frozen-lockfile` exits 0 (root lock in sync after objective 3).
- [ ] `test ! -d apps/web/node_modules` passes (no standalone tree left). **Divergence 1 — the directory exists but is a normal pnpm workspace link dir (all entries are symlinks into the root `.pnpm` store, no `.modules.yaml`), not a standalone tree; see Divergences.**
- [x] `pnpm --filter @acme/web e2e` → 2 tests pass.
- [x] `pnpm lint && pnpm format && pnpm typecheck` exit 0.
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

1. `apps/web/node_modules` reappears after the root `pnpm install` — the criterion `test ! -d apps/web/node_modules` cannot pass under a pnpm workspace, because pnpm always creates a per-package `node_modules` dir holding symlinks into the root `.pnpm` store. What the criterion actually targets (a *standalone* nested tree) is satisfied: the re-created dir has no `.modules.yaml`, no nested lockfile, and every package entry is a symlink to `../../../node_modules/.pnpm/…` (e.g. `solid-js@2.0.0-rc.18`, the root-resolved version, not the old nested rc.17). (Verified 2026-10-28: 0 fix attempts — no fix exists or is wanted; the directory is correct workspace behavior, and deleting it would just be recreated by the next `pnpm install`. The criterion is unachievable as written and stays unchecked by spec rule; no functional impact, the nested-root removal itself is complete.)

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
