# Spec 30 — Phase AD: Expo hardening

- Source: sb-stack-v1 release audit (2026-10-29), expo items (prerelease toolchain, blank-screen UX).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: the expo app sits on the stable SDK 58 line, signed-in nameless users see their email, the post screen has loading/error states, and delete failures are visible.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Prerelease → stable (SDK 58 stable shipped 2026-10-15) — requirements: `apps/expo/package.json` `expo` `58.0.0-preview.3` → latest `58.0.x` (`58.0.21`), `react-native` `0.88.0-rc.0` → latest `0.88.x` (`0.88.1`), `@expo/metro` `58.0.0-rc.0` → matching stable (`58.0.0`); `pnpm install --no-frozen-lockfile`; CI's `pnpm --filter @acme/expo exec expo export --platform ios` must pass (contingency C2 not triggered); commands: edit `apps/expo/package.json`, install, export
- [x] 2. Greeting email fallback — requirements: `apps/expo/src/app/index.tsx:126`: greeting falls back to `session.user.email` when `name` is empty (today a signed-in nameless user sees "Not logged in"); commands: edit `apps/expo/src/app/index.tsx`
- [x] 3. Post screen loading/error states — requirements: `apps/expo/src/app/post/[id].tsx:18`: replace `if (!data) return null` with a loading state ("Loading…") and an error state ("Could not load post") — today loading, bad ids, and offline all render a blank screen; commands: edit `apps/expo/src/app/post/[id].tsx`
- [x] 4. Surface delete failures — requirements: `apps/expo/src/app/index.tsx:202-211`: render `deletePostMutation.error?.message` near the list (same pattern as CreatePost's error at :91) — today delete failures are silent; commands: edit `apps/expo/src/app/index.tsx`
- [x] 5. Keep deliberately — requirements: no action; placeholder `bundleIdentifier`/`package` `"your.bundle.identifier"`, commented `extra.eas.projectId`, localhost `EXPO_PUBLIC_API_URL` default stay — correct template values for adopters to replace; commands: none

## 2. No-go

- Do not change the placeholder bundle identifiers/EAS project id or the localhost `EXPO_PUBLIC_API_URL` default.
- If the SDK 58 stable upgrade breaks uniwind/metro beyond 15 fix attempts (contingency C2): pin the exact latest-stable versions that resolve, file a Linear issue (Specs-Issue format), and continue objectives 2–4 (independent of the upgrade).

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `pnpm --filter @acme/expo exec expo export --platform ios` exits 0.
- [x] `pnpm lint && pnpm typecheck` green for `@acme/expo`.
- [x] UI states (objectives 2–4) verified by typecheck + export plus a simulator check where available — this machine has no Expo development build (known limitation since spec 06 divergence 3); if the simulator is unavailable, record that in the spec divergence section and ship the states as code-reviewed changes (divergence 1).
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

1. No simulator check for objectives 2–4 — this machine has no Expo
   development build (known limitation since spec 06 divergence 3), so the
   three UI states ship as code-reviewed changes verified by `tsc --noEmit`
   and `expo export --platform ios` (both green); the interactive pass is
   deferred to an adopter with a dev build. (Verified 2026-10-29: 0 fix
   attempts — environment limitation.)

2. A residual prerelease peer survives in the graph: `expo`/`react-native` are
   on stable (`58.0.21` / `0.88.1`), but pnpm auto-installs
   `@react-native/metro-config@0.88.0-rc.0` for
   `@react-native/community-cli-plugin@0.88.1` (which peers `0.88.1`),
   emitting one install-time warning. (Verified 2026-10-29: 3 fix attempts —
   `pnpm update @react-native/metro-config -r` (no re-resolution),
   workspace `overrides: {'@react-native/metro-config': 0.88.1}` + fresh
   resolution (pnpm's peer auto-install ignores overrides here),
   `pnpm dedupe` (churned unrelated versions — prettier 3.6.2→3.9.10 — and
   still missed it; the churn was reverted via `git checkout pnpm-lock.yaml`
   + clean re-resolution) — all fenced by pnpm's peer auto-install
   resolution; the override line was removed again to avoid dead config.)
   Impact: the warning appears at install time only; `expo export --platform
   ios`, lint, typecheck, and every suite are green on the stable toolchain.

### Unresolved divergences → `specs/divergencies/`

*A divergence that stays OPEN because a later spec owns the fix MUST also get a
tracking file in `specs/divergencies/`, so future agents can find and clear it.
Name it `<spec-id>-<short-slug>.md` (e.g.
`02-B-api-typecheck-lint-red.md`). Include: source spec + the exact criteria it
blocks, what is broken (files/imports), why each fix attempt was fenced, and a
"how to clear it" checklist naming the spec that resolves it plus the commands
to re-verify. Then link the tracking file from the matching Divergence entry
above (e.g. "**Tracked for future check-up in
`specs/divergencies/<file>.md`**"). When the later spec lands and the checks
pass, mark the criteria `[x]` and remove the tracking file.*
