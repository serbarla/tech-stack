# Spec 17 — Phase Q: `apps/web` lint/format/typecheck coverage

- Source: sb-stack-v1 monorepo audit (2026-10-28), finding 5.
- Depends on: spec 15-O (single install tree), spec 14-N (e2e must stay green).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: `apps/web` participates in root `pnpm lint`/`format`/`typecheck` (and therefore CI) via a shared Solid ESLint preset; `vp check` stays as-is.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Add a Solid ESLint preset to the shared config — requirements: `tooling/eslint/package.json` `dependencies` gains `eslint-plugin-solid` (direct version, matching the `typescript-eslint`/`eslint-plugin-react` pattern — no catalog entry, single-consumer family); new `tooling/eslint/solid.ts` extends `./base` and applies `eslint-plugin-solid/configs/v2` (the config the `apps/web/AGENTS.md` primer recommends); `exports` gains `"./solid": "./solid.ts"`; commands: `pnpm --filter @acme/eslint-config add eslint-plugin-solid && pnpm nx run @acme/eslint-config:typecheck` (divergence 1: `solid.ts` does not extend `./base`; see Divergences)

- [x] 2. Wire lint/format/typecheck into `apps/web` — requirements: `apps/web/package.json` gains scripts `"lint": "eslint --flag unstable_native_nodejs_ts_config"`, `"format": "prettier --check . --ignore-path ../../.gitignore --ignore-path .prettierignore"`, `"typecheck": "tsc --noEmit"`, plus the `"prettier": "@acme/prettier-config"` field; devDeps gain `@acme/eslint-config`, `@acme/prettier-config` (workspace) and `eslint`, `prettier` (catalog) — mirror the `apps/expo` devDeps; create `apps/web/eslint.config.mts` extending `@acme/eslint-config/solid` (mirror `apps/expo/eslint.config.mts` shape); create `apps/web/.prettierignore` covering at least `dist` and the generated entries the sibling apps ignore; keep `check` (`vp check`) untouched; contingency: if `tsc --noEmit` cannot typecheck `e2e/**` or `playwright.config.ts`, exclude those paths in `apps/web/tsconfig.json` (one line) and re-run; commands: `pnpm --filter @acme/web add -D @acme/eslint-config @acme/prettier-config eslint prettier && pnpm nx run @acme/web:typecheck` (tsconfig contingency not needed: `tsc --noEmit` passed with e2e included)

- [x] 3. Make the new gates green — requirements: fix any lint/prettier/tsc findings the new config surfaces without changing app behavior; commands: `pnpm nx run @acme/web:lint && pnpm nx run @acme/web:format && pnpm nx run @acme/web:typecheck`

## 2. No-go

- Do not change Solid app behavior beyond lint/format-driven fixes.
- Do not remove or bypass `vp check`.
- Do not add unit tests (AGENTS.md: e2e/integration only).
- Do not add prettier plugins beyond what the shared config already pulls in.
- Do not rewrite e2e expectations to fit lint; a flagged line is fixed, not disabled, unless a No-go fences it (then record a divergence).

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `grep -n '"./solid"' tooling/eslint/package.json` prints the new export.
- [x] `pnpm nx run @acme/web:lint` exits 0.
- [x] `pnpm nx run @acme/web:format` exits 0.
- [x] `pnpm nx run @acme/web:typecheck` exits 0.
- [x] `pnpm lint && pnpm format && pnpm typecheck` exit 0 with `@acme/web` now included in the Nx run (lint/format task count up by one).
- [x] `pnpm --filter @acme/web e2e` → 2 tests pass.
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

1. `tooling/eslint/solid.ts` exports `solidConfig` as a framework-only preset (mirroring `tooling/eslint/react.ts`: plugin config scoped to `files`, composed with `baseConfig` in the app's `eslint.config.mts`) instead of extending `./base` as objective 1 stated — extending `./base` inside the preset would double-apply `baseConfig` in `apps/web/eslint.config.mts`, which objective 2 requires to mirror `apps/expo/eslint.config.mts`'s `baseConfig` + framework composition; the two objectives were mutually incompatible as written, and the `react.ts` precedent was chosen to keep the preset family consistent. (Verified 2026-10-28: 0 fix attempts needed — all gates, root run, and e2e green with this shape; no criteria blocked.)

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
