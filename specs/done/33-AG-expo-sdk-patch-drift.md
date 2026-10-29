# Spec 33 — Phase AG: Expo SDK 58 patch drift

- Source: Expo SDK 58 alignment plan (2026-10-29), phase 2 of 4.
- Depends on: 31-AE (expo-router 58.0.28 already landed).
- Repo root: `sb-stack-v1/`. Every path and command below is relative to it.
- Result carried forward: six expo modules are re-resolved to their SDK 58.0.21 expected patch versions via lockfile only (no manifest edits).

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

- [x] 1. Re-resolve stale modules — requirements: these six packages' manifest ranges already permit the expected version but pnpm's lockfile entry is stale; move them via `pnpm update` (no `package.json` edits): `expo-network` → 58.0.4, `expo-secure-store` → 58.0.2, `expo-splash-screen` → 58.0.12, `expo-system-ui` → 58.0.7, `expo-web-browser` → 58.0.7, `expo-dev-client` → 58.0.17; commands: `pnpm --filter @acme/expo update expo-network expo-secure-store expo-splash-screen expo-system-ui expo-web-browser expo-dev-client`. *(Command run as written; it transiently rewrote the six manifest ranges — divergence 1 records the revert. End state: lockfile moved, `package.json` byte-identical to HEAD for these six.)*
- [x] 2. Confirm alignment — requirements: `expo install --check` no longer lists these six (only `react-native-reanimated` and `react-native-safe-area-context` remain); commands: `pnpm --filter @acme/expo exec expo install --check`. *(Verified: output lists exactly `react-native-reanimated@4.7.0` and `react-native-safe-area-context@5.9.1`.)*

## 2. No-go

*What this spec MUST NOT do, even if convenient. Never touch anything listed here.*

- Do not edit any `package.json` in this phase (ranges are already correct).
- Do not bump any package past its expected `~` version.
- Do not run `npx expo prebuild`; only note that plugin output must be diffed at the next native build.

## 3. Testing criteria

*Observable proof the spec is complete. Every box checked = spec done.*

- [x] `pnpm install --frozen-lockfile` exits 0
- [x] `pnpm --filter @acme/expo exec expo install --check` → lists only `react-native-reanimated` and `react-native-safe-area-context`
- [x] `pnpm --filter @acme/expo exec expo export --platform ios` exits 0
- [x] `pnpm --filter @acme/expo typecheck` and `pnpm --filter @acme/expo lint` exit 0
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

1. Objective 1's command, run verbatim, edited `apps/expo/package.json` —
   `pnpm update <pkg>` rewrites the manifest range to `~<resolved>` even when
   the existing range already permits the resolution (the six went
   `~58.0.0`/`~58.0.1`/`~58.0.3` → `~58.0.4`/`~58.0.2`/`~58.0.12`/`~58.0.7`/
   `~58.0.7`/`~58.0.17`), which No-go rule 1 ("do not edit any package.json in
   this phase") forbids — so the command could not be run as written without
   violating the No-go. (Verified 2026-10-29: 1 fix attempt — revert the six
   ranges to their pre-run values, then `pnpm install --no-frozen-lockfile` to
   re-sync the lockfile importer specifiers — locked versions kept because they
   satisfy the restored ranges; `git diff` on the six names is empty,
   resolutions stay 58.0.4/58.0.2/58.0.12/58.0.7/58.0.7/58.0.17, and
   `pnpm install --frozen-lockfile` exits 0. Control: in a scratch project
   `pnpm update is-odd` rewrote `~0.1.0` → `~0.1.2`. Impact: none deferred —
   the spec's carried-forward result ("lockfile only, no manifest edits")
   holds; later phases that prescribe `pnpm update` must expect and revert the
   manifest rewrite.)

---

*Housekeeping: once a spec is fully done with no open divergences, move its
file to `specs/done/` (e.g. `specs/done/01-A-nx-in-turborepo-nextjs-tanstack-out.md`).
Specs with open divergences stay in `specs/` next to `TEMPLATE.md` until the
tracking file is cleared.*
