# Spec 32 — Phase AF: TypeScript 6.0 migration

- Source: Expo SDK 58 alignment plan (2026-10-29), phase 1 of 4.
- Depends on: nothing (tooling-only; no expo runtime coupling).
- Repo root: `sb-stack-v1/`. Every path and command below is relative to it.
- Result carried forward: `typescript` is the workspace-wide 6.0.3 compiler with the TS 6 `types`/`rootDir` migrations applied, and lint/typecheck/build stay green with no source edits.

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

- [x] 1. Bump the TypeScript catalog — requirements: `pnpm-workspace.yaml` `catalog.default.typescript` `^5.9.3` → `^6.0.3`; stay on the 6.x line, do NOT jump to `7.0.2` (expo expects `~6.0.3`); commands: edit `pnpm-workspace.yaml`.
- [x] 2. Anchor declaration-emit root — requirements: `tooling/typescript/compiled-package.json` gains `"rootDir": "${configDir}/src"` so `@acme/api|db|validators` keep emitting `dist/index.d.ts` instead of `dist/src/*` (TS 6 defaults `rootDir` to the tsconfig dir, which fails with TS5011); commands: edit `tooling/typescript/compiled-package.json`.
- [x] 3. Restore ambient node types — requirements: TS 6 defaults `types` to `[]`; add `"types": ["node"]` under `compilerOptions` in `packages/db/tsconfig.json`, `packages/auth/tsconfig.json`, `tooling/eslint/tsconfig.json`, `tooling/tailwind/tsconfig.json`. Do NOT add it to `apps/web/tsconfig.json` or `apps/server/tsconfig.json` (already set), nor to `apps/expo`, `packages/api`, `packages/validators` (no node globals used); commands: edit the four files.
- [x] 4. Lift the typescript-eslint peer ceiling — requirements: `tooling/eslint/package.json` `typescript-eslint` `^8.46.2` → `^8.72.1` (8.46.2 peers `ts >=4.8.4 <6.0.0`; 8.72.1 allows `<6.1.0`); commands: edit `tooling/eslint/package.json`.
- [x] 5. Install and lock — requirements: re-resolve the lockfile and apply postinstall; commands: `pnpm install --no-frozen-lockfile`.

## 2. No-go

*What this spec MUST NOT do, even if convenient. Never touch anything listed here.*

- Do not edit any `.ts`/`.tsx` source file — this phase is config-only.
- Do not add `ignoreDeprecations` to any tsconfig.
- Do not adopt TypeScript 7.x.
- Do not touch `apps/web/tsconfig.json` or `apps/server/tsconfig.json`.

## 3. Testing criteria

*Observable proof the spec is complete. Every box checked = spec done.*

- [x] `pnpm install --frozen-lockfile` exits 0
- [x] `pnpm typecheck` → 13/13 tasks succeed
- [x] `pnpm lint` → 10/10 tasks succeed
- [x] `pnpm build` → 4/4 tasks succeed
- [x] `test -f packages/api/dist/index.d.ts && test ! -d packages/api/dist/src` (declaration layout unchanged)
- [x] `pnpm --filter @acme/expo exec expo install --check` no longer lists `typescript`
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
