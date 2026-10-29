# Spec 34 — Phase AH: Reanimated & SafeArea native bumps

- Source: Expo SDK 58 alignment plan (2026-10-29), phase 3 of 4.
- Depends on: 33-AG.
- Repo root: `sb-stack-v1/`. Every path and command below is relative to it.
- Result carried forward: `react-native-reanimated` 4.7.1 and `react-native-safe-area-context` 5.10.1, and `expo install --check` reports "Dependencies are up to date".

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

- [x] 1. Bump Reanimated — requirements: `apps/expo/package.json` `react-native-reanimated` `4.7.0` → `4.7.1` (stays inside `react-native-worklets@0.13.x`'s peer range); commands: edit `apps/expo/package.json`.
- [x] 2. Bump SafeAreaContext — requirements: `apps/expo/package.json` `react-native-safe-area-context` `~5.9.1` → `~5.10.1`; commands: edit `apps/expo/package.json`.
- [x] 3. Install and lock — requirements: re-resolve the lockfile; commands: `pnpm install --no-frozen-lockfile`.

## 2. No-go

*What this spec MUST NOT do, even if convenient. Never touch anything listed here.*

- Do not move Reanimated off the 4.7.x line.
- Do not change `react-native-worklets` (0.13.0) or `react-native` (0.88.1).
- Do not edit native config or run `npx expo prebuild`; the native rebuild is a manual follow-up, not part of this spec.

## 3. Testing criteria

*Observable proof the spec is complete. Every box checked = spec done.*

- [x] `pnpm install --frozen-lockfile` exits 0
- [x] `pnpm --filter @acme/expo exec expo install --check` → "Dependencies are up to date"
- [x] `pnpm --filter @acme/expo exec expo export --platform ios` exits 0
- [x] `pnpm --filter @acme/expo typecheck` and `pnpm --filter @acme/expo lint` exit 0
- [x] manual: regenerate the dev client / EAS build to pick up the native code (cleared 2026-10-29 — native dev build on iPhone 16 simulator; see divergence 1 RESOLVED)
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

1. ~~No device-level runtime verification — both packages ship native code, but
   this machine has no Expo dev build, so only `expo export`, typecheck, and
   lint are provable here~~ — **RESOLVED 2026-10-29 by a native dev build on
   this machine**: `expo run:ios` built the dev client from source on the
   iPhone 16 (iOS 18.6) simulator under Xcode 27.1. Pods are at the exact
   targets — `RNReanimated` 4.7.1, `react-native-safe-area-context` 5.10.1,
   `RNWorklets` 0.13.0 (unchanged, per No-go) — all compiled from source (no
   prebuilt tarball), codegen-generated, and auto-linked; `Build Succeeded`
   with 0 errors. The app installed, launched, and bundled JS (1620 modules)
   with no native crash (process alive, `xcodebuild-error.log` empty).
   `SafeAreaView` (safe-area-context) renders at runtime with correct insets
   (simulator screenshot). Reanimated is linked+compiled but unused by app JS
   (no source or transitive import), so no animation exists to observe. Gates
   re-run green: `pnpm install --frozen-lockfile`, `expo install --check`
   ("Dependencies are up to date"), `expo export --platform ios`, typecheck,
   lint. Tracking file
   `specs/divergences/34-AH-no-device-native-verification.md` removed.

   ---

*Housekeeping: once a spec is fully done with no open divergences, move its
file to `specs/done/` (e.g. `specs/done/01-A-nx-in-turborepo-nextjs-tanstack-out.md`).
Specs with open divergences stay in `specs/` next to `TEMPLATE.md` until the
tracking file is cleared.*
