# Spec 22 — Phase V: Remove the unused `@acme/ui` package

- Source: sb-stack-v1 monorepo audit (2026-10-28), dead-weight item.
- Depends on: spec 17-Q (web gates green independently of `ui`).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: no React/shadcn package in the workspace; README/AGENTS notes about `@acme/ui` and `ui-add` removed; every workspace gate stays green.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [ ] 1. Delete `packages/ui` and its references — requirements: first verify no consumer exists (`grep -rn "@acme/ui\|ui-add" apps packages tooling .github || true` — expected: only README/AGENTS prose); then `git rm -r packages/ui`; run `pnpm install` to drop it from the lockfile/workspace graph; remove the `@acme/ui` README tree entry, the "6a ui-add" README section, and any AGENTS.md/other docs mention; commands: `grep -rn "@acme/ui\|ui-add" apps packages tooling README.md AGENTS.md .github || true` then `git rm -r packages/ui && pnpm install`

- [ ] 2. Prove the stack is unaffected — requirements: root lint/format/typecheck/build/e2e all green without the package; commands: `pnpm lint && pnpm format && pnpm typecheck && pnpm build`

## 2. No-go

- Do not port shadcn components to Solid or re-add them anywhere.
- Do not touch `apps/expo` or `apps/web` UI code.
- Do not keep any dependency that exists only for `ui` (radix-ui, cva, sonner, tailwind-merge leave with it).

## 3. Testing criteria

*All boxes checked = spec done.*

- [ ] `grep -rn "@acme/ui\|ui-add" apps packages tooling README.md AGENTS.md` prints nothing.
- [ ] `pnpm lint && pnpm format && pnpm typecheck` exit 0 (task count drops by one for the deleted package).
- [ ] `pnpm build` exits 0.
- [ ] `pnpm --filter @acme/web e2e` → 2 tests pass.
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
