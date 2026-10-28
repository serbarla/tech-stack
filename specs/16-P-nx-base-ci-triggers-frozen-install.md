# Spec 16 — Phase P: Nx affected base + CI triggers + frozen install

- Source: sb-stack-v1 monorepo audit (2026-10-28), findings 3 and 4 plus the frozen-lockfile gap.
- Depends on: spec 15-O (so the frozen install has one lockfile to verify).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: `nx affected` diffs against the real default branch (`master`); CI push builds trigger on `master`; CI install fails loudly on any lockfile drift.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [ ] 1. Fix the Nx affected base — requirements: `nx.json` `"defaultBase": "main"` → `"master"` (the host repo's default branch; template adopters who publish on `main` must flip this after export — note it in the README CI section); commands: `grep -n "defaultBase" nx.json`

- [ ] 2. Fix the CI push trigger — requirements: `.github/workflows/ci.yml` `push: branches: ["main"]` → `["master"]`; `pull_request`/`merge_group` triggers and everything else unchanged; update the README CI section wording (`main` → `master`); commands: `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'`

- [ ] 3. Freeze the CI install — requirements: `tooling/github/setup/action.yml` install step `pnpm install` → `pnpm install --frozen-lockfile`; contingency: if frozen install fails locally on the current tree, run a plain `pnpm install` to sync the lockfile, commit it, then re-run frozen — the lockfile must end up reproducible; commands: `grep -n "pnpm install" tooling/github/setup/action.yml`

## 2. No-go

- Do not rename the git branch or re-point origin's default.
- Do not add/remove/rename CI jobs (specs 18-R and 19-S own new jobs).
- Do not hand-edit `pnpm-lock.yaml`.
- Do not switch to `pnpm install --no-frozen-lockfile` as the final state.

## 3. Testing criteria

*All boxes checked = spec done.*

- [ ] `grep -n '"defaultBase"' nx.json` → `"defaultBase": "master"`.
- [ ] `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'` prints `ok`.
- [ ] `grep -n "frozen-lockfile" tooling/github/setup/action.yml` prints the frozen install step.
- [ ] `pnpm install --frozen-lockfile` exits 0 at repo root; `git status --short` clean afterwards.
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
