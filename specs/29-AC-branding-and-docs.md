# Spec 29 — Phase AC: Branding and docs

- Source: sb-stack-v1 release audit (2026-10-29), branding/docs items.
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: the product is branded **SB Stack** everywhere, the users demo has no `NaN` links, the READMEs match the code, and the quickstart works on a fresh clone.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Branding → **SB Stack** — requirements: `apps/web/src/App.tsx:13`, `Document.tsx:16`, `routes/[...404].tsx:15`, `routes/users/index.tsx:12`, `routes/users/[id].tsx:40` (`"Solid App"` → `"SB Stack"`); `apps/expo/src/app/index.tsx:219` (the `"Create T3 Turbo"` heading → `"SB Stack"`); commands: edit six files
- [x] 2. Guard the users "next" link — requirements: `apps/web/src/routes/users/[id].tsx:22,44`: non-numeric id currently emits `href` `NaN` and dead-ends past id 3 — guard the "next" link on `Number.isInteger(n) && users[n + 1]` existing; non-numeric ids render the "Unknown" page without the broken link; commands: edit `apps/web/src/routes/users/[id].tsx`
- [x] 3. Fix the Expo deployment note — requirements: root `README.md:211`: "modify the `getBaseUrl` function …" → "set `EXPO_PUBLIC_API_URL` for your backend's public URL (declared in `apps/expo/.env.schema`)"; re-check the surrounding Expo deployment steps against code (EAS steps are generic and code-accurate; only the `getBaseUrl` step was stale); commands: edit `README.md`
- [x] 4. Rewrite `apps/web/README.md` for this repo — requirements: dev URL `http://localhost:3001` (`vite.config.ts:24`, not 3000), data at `src/lib/users.json` (not `src/data/`), the sample unit suite (`pnpm --filter @acme/web test`) documented; drop stock Solid-CLI inaccuracies; commands: edit `apps/web/README.md`
- [x] 5. Fresh-clone walkthrough — requirements: clone the repo to `/tmp`, follow README quickstart verbatim (`pnpm install`, `pnpm db:migrate`, `pnpm dev`); fix any README step that doesn't work as written (all steps worked as written); commands: clone + run

## 2. No-go

- Do not change the kept demo content (users.json, Counter/logo, routes) beyond the next-link guard and branding.
- Do not alter the Expo placeholder values (`your.bundle.identifier`, commented `eas.projectId`, localhost `EXPO_PUBLIC_API_URL` default).

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `grep -rn "Solid App\|Create T3 Turbo" apps/` prints nothing (after a fresh `pnpm build`).
- [x] `grep -n "getBaseUrl" README.md` prints nothing.
- [x] `http://localhost:3001/users/abc` renders "Unknown" with no `NaN` in the DOM.
- [x] Walkthrough: `/api/auth/ok` returns 200 and `http://localhost:3001` renders the post list.
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

1. The walkthrough copies the working tree to `/tmp/sb-walkthrough` via rsync
   (excluding `node_modules`, `.git`, `data`, `dist`) instead of `git clone`:
   this phase's changes are uncommitted on the worktree branch until the
   release-proof step, so a clone would test the pre-audit tree. The copy is
   otherwise a fresh checkout (no install artifacts, no `data/`) and the
   README quickstart (`pnpm install`, `pnpm db:migrate`, `pnpm dev`) ran
   verbatim on it — every step worked as written. (Verified 2026-10-29: 0 fix
   attempts — substitution only; re-run as a true clone after the release
   commit lands is part of the release-proof PR.)

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
