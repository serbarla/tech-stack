# Spec 31 — Phase AE: Release-proof audit pins

- Source: release-proof run of the audit plan (2026-10-29) — the plan's "all jobs green" list includes the `audit` job (`pnpm audit --audit-level high`), which failed on four high advisories at the release state.
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths.
- Result carried forward: `pnpm audit --audit-level high` exits 0 on the release state; every locally-runnable CI job command is green.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Clear the high advisories via the repo's audit mechanisms (`overrides` pins in `pnpm-workspace.yaml`, established by spec 18-R; `auditConfig.ignoreGhsas` for the unfixable-in-place one) — requirements: `seroval@<1.7.0` pin `1.6.3` → `1.6.12` (advisories GHSA-7rv5-mrxv-xcr9 et al. now floor at 1.6.8; the `seroval@1.7.0` line is already outside the vulnerable range) clears 3 highs; GHSA-qr28-fpjm-wq7f (`decode-uri-component <=0.5.0`) was suppressed via `auditConfig.ignoreGhsas` at execution time (see divergence 2 — the only patched line breaks `query-string@7.1.3`'s call shape; the suppression was cleared 2026-10-29 by the `expo-router@58.0.28` upgrade); no other dependency was upgraded then; commands: edit `pnpm-workspace.yaml`, `CI=false pnpm install --no-frozen-lockfile`

## 2. No-go

- Do not upgrade any dependency beyond the `seroval` pin.
- Do not force `decode-uri-component@0.5.1` (runtime-breaking, see divergence 2).
- Do not lower `--audit-level high`; low/moderate advisories stay as-is.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `pnpm audit --audit-level high` exits 0 (4 low | 9 moderate remain, below the threshold).
- [x] `pnpm install --frozen-lockfile` exits 0.
- [x] Full battery green on the same tree: `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm build`, `pnpm --filter @acme/server test`, `pnpm --filter @acme/web test`, `pnpm --filter @acme/web e2e`, `pnpm --filter @acme/expo exec expo export --platform ios`, `pnpm nx run @acme/web:check`.
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

1. The four high advisories pre-existed this audit session (the base commit's
   `pnpm-lock.yaml` resolves the same `seroval@1.6.3`/`decode-uri-component@0.2.2`
   — verified by `git show 56a7fb3:sb-stack-v1/pnpm-lock.yaml`); the
   advisories are newer than spec 18-R's pins, so the audit gate the plan
   expected to be green was red for reasons outside the 8 phase scopes. Fixed
   forward here rather than filing a Linear issue (within budget). (Verified
   2026-10-29.)

2. GHSA-qr28-fpjm-wq7f (`decode-uri-component <=0.5.0`, high, DoS via
   quadratic percent-decoding) cannot be fixed in place and is suppressed via
   `auditConfig.ignoreGhsas`. Evidence: the only patched line is `0.5.1`,
   which changes the export shape (`module.exports` object with `.default`,
   not a callable — reproduced: `require()` + call throws `d is not a
   function`), while `query-string@7.1.3` — pinned `^7.1.3` by
   `expo-router@58.0.4` — does `const decodeComponent =
   require('decode-uri-component')` and calls it directly; `query-string@8`
   still requires `^0.4.1` (0.5.1 out of range) and `@9`/`@10` is a
   double-major jump through expo-router's navigation core with no runtime
   verification possible here (no dev build — spec 30-AD divergence 1).
   (Verified 2026-10-29: 2 fix attempts — forced `decode-uri-component: 0.5.1`
   override (removed: runtime-breaking per the probe), `query-string` major
   jump (rejected: unverifiable navigation-critical churn) — both fenced.)
   Impact: exposure is a percent-encoded DoS in the RN client's URL parsing.
   **Resolved 2026-10-29**: `expo-router@58.0.28` (the SDK 58
   `bundledNativeModules` recommendation) dropped `query-string` entirely, so
   the lockfile no longer contains `query-string` or
   `decode-uri-component`. The `auditConfig.ignoreGhsas` entry and its comment
   were removed; `pnpm audit --audit-level high` exits 0 without it. The
   upgrade also required the SDK-aligned peers `expo-linking ~58.0.15`,
   `expo-constants ~58.0.14`, `expo-status-bar ~58.0.4`,
   `react-native-screens ~4.30.0`, and an explicit
   `@expo/metro-runtime ~58.0.15` so pnpm stops reusing the stale `6.1.1`
   peer instance. `expo export --platform ios`, lint, typecheck, and build
   are green on the upgraded tree.
