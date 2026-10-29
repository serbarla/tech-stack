# Spec 21 — Phase U: Repo guardrails (.npmrc, editorconfig, license, format:write)

- Source: sb-stack-v1 monorepo audit (2026-10-28), missing-infra list.
- Depends on: spec 17-Q (per-package format green before `format:write` lands).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: engine-strict installs, canonical line endings, `LICENSE`/`SECURITY.md`/`CODEOWNERS`, and a root `format:write` for devs.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Add `.npmrc` — requirements: `engine-strict=true` so `engines.node`/`engines.pnpm` are enforced at install; no other settings; commands: `grep -n "engine-strict" .npmrc && pnpm install`

- [x] 2. Add `.editorconfig` and `.gitattributes` — requirements: `.editorconfig` (UTF-8, LF, 2-space indent, trailing whitespace trimmed, final newline) matching the Prettier config; `.gitattributes` with `* text=auto eol=lf`; commands: `git check-attr text eol -- pnpm-lock.yaml`

- [x] 3. Add `LICENSE` (MIT), `SECURITY.md`, `CODEOWNERS` — requirements: `LICENSE` MIT, copyright 2026, matching the per-package `"license": "MIT"`; `SECURITY.md` with a short disclosure policy pointing at GitHub private vulnerability reporting; `CODEOWNERS` with `* @serbarla` (template adopters change the handle); commands: `head -2 LICENSE && ls SECURITY.md CODEOWNERS`

- [x] 4. Add a root `format:write` script — requirements: `package.json` gains `"format:write": "pnpm -r --parallel exec prettier . --write --ignore-path ../../.gitignore"` (runs from each package dir, so the `../../.gitignore` ignore-path resolves identically to the per-package scripts; parity with the existing `format` target, which is also per-package and never touches the root lockfile); after running it, `pnpm format` must be green; commands: `pnpm format:write && pnpm format`

## 2. No-go

- Do not change line-ending or whitespace conventions beyond what Prettier already enforces.
- Do not add husky/lint-staged/commit hooks (not requested).
- Do not re-license the packages (they stay MIT) or publish anything.
- Do not add changelog/release tooling (private workspace).
- Do not add `.npmrc` settings beyond `engine-strict`.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `grep -n "engine-strict" .npmrc` prints `engine-strict=true`.
- [x] `git check-attr text eol -- pnpm-lock.yaml` prints `text: auto` and `eol: lf`.
- [x] `LICENSE`, `SECURITY.md`, `CODEOWNERS` exist; `head -2 LICENSE` shows MIT.
- [x] `pnpm format:write` exits 0 and `pnpm format` exits 0 afterwards.
- [x] `pnpm install` exits 0 under engine-strict.
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

1. The root `format:write` script is not parity with `pnpm format`: the
   prescribed command
   `pnpm -r --parallel exec prettier . --write --ignore-path ../../.gitignore`
   omits the `--ignore-path .prettierignore` that every app's `format` target
   passes, so it rewrites five git-tracked, generated declaration files —
   `apps/expo/env.d.ts`, `apps/expo/uniwind-types.d.ts`,
   `apps/server/env.d.ts`, `apps/web/env.d.ts`, `apps/web/file-routes.d.ts` —
   that `apps/*/.prettierignore` explicitly excludes ("leave it as
   varlock/uniwind/filesystem-routing writes it"). Observed: `pnpm format:write`
   writes all five, then `pnpm env:validate` (the CI `env` job) regenerates the
   three `env.d.ts` files straight back to their unformatted form, so the root
   writer has no fixpoint against codegen; `pnpm format` stays green throughout
   because those files are ignored there — current state: the Command is in
   place verbatim and the five files were reverted to `HEAD`, so this spec lands
   no generated-file churn — the exact command string is a hard requirement of
   objective 4, and appending `--ignore-path .prettierignore` (the only fix that
   restores the parity objective 4 describes) would deviate from it, so it was
   not applied (Verified 2026-10-29: 0 fix attempts — the string is fixed by the
   objective, not by reality; no testing criterion is blocked, both
   `pnpm format:write` and `pnpm format` exit 0. Recommended one-line follow-up
   for the owner: append `--ignore-path .prettierignore` to the root
   `format:write` script.) ~~Tracked for future check-up in `specs/divergencies/21-U-format-write-ignore-path.md`~~ (tracking file removed on resolution, see below.)

   **RESOLVED 2026-10-29:** root `format:write` now passes
   `--ignore-path .prettierignore` (the script runs via `pnpm -r exec` from
   each package dir, so the relative path resolves per package). Re-verified:
   `pnpm format:write` leaves all five generated files byte-identical
   (shasum before/after) and exits 0; `pnpm format` exits 0. Tracking file
   `specs/divergencies/21-U-format-write-ignore-path.md` deleted.

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
