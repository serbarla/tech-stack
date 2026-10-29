# Spec 35 — Phase AI: Expo SDK drift gate in CI

- Source: Expo SDK 58 alignment plan (2026-10-29), phase 4 of 4.
- Depends on: 33-AG and 34-AH (the gate must be green when added).
- Repo root: `sb-stack-v1/`. Every path and command below is relative to it.
- Result carried forward: the CI `expo` job fails when any expo package drifts from its SDK 58.0.21 expected version.

## Before you start

Unit testing is not required; avoid it. Prioritize end-to-end and integration
testing only.

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing.

If reality diverges from this spec: STOP, append a divergence (section 4), and
NEVER improvise outside the objectives.

## 1. Objectives

*The ordered work to implement — one item per step. Check `[x]` only after the
step is implemented and verified.*

*Item format:* `<verb phrase>` — requirements: `<what must change / constraints>`; commands: `<exact command>`.

- [x] 1. Add the drift gate — requirements: in `.github/workflows/ci.yml`, add a step to the existing `expo` job that runs `pnpm --filter @acme/expo exec expo install --check`; place it before the "Expo export" step so drift fails fast; commands: edit `.github/workflows/ci.yml`.
- [x] 2. Prove the gate locally — requirements: the same command already exits 0 after 33-AG + 34-AH; commands: `pnpm --filter @acme/expo exec expo install --check`.

## 2. No-go

*What this spec MUST NOT do, even if convenient. Never touch anything listed here.*

- Do not add `--fix` or invoke `expo install` in CI (must never mutate the lockfile in a check job).
- Do not modify any CI job other than `expo`.

## 3. Testing criteria

*Observable proof the spec is complete. Every box checked = spec done.*

- [x] the `expo` job contains the `expo install --check` step and it exits 0 (CI or local run)
- [x] `pnpm --filter @acme/expo exec expo export --platform ios` still exits 0
- [x] every objective in section 1 is checked

## 4. Divergences

*Process and tracking-file rules: see `AGENTS.md` (§ Spec-Driven Development).
Summary: when reality diverges from the spec, append a numbered entry below;
leave the matching testing-criteria `- [ ]` unchecked and note the divergence
inline next to it. Open divergences owned by a later spec also get a tracking
file in `specs/divergences/`.*

- [x] every divergence found is appended below (or the section reads "None.")

*Entry format (one numbered item per divergence):*

1. <what diverged and its current state> — <why it could not be done as
   written, citing the No-go rule or spec that blocks it> (Verified <date>:
   <N> fix attempts — <attempt 1>, <attempt 2>, <attempt 3> — all fenced by
   <constraint>; <impact> is deferred to <later spec> by design, not a defect.)

### Divergences

None.


---

*Housekeeping: once a spec is fully done with no open divergences, move its
file to `specs/done/` (e.g. `specs/done/01-A-nx-in-turborepo-nextjs-tanstack-out.md`).
Specs with open divergences stay in `specs/` next to `TEMPLATE.md` until the
tracking file is cleared.*