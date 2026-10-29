# Spec 11 — Phase K: Remove Discord completely

- Source: `BETTER_AUTH_EMAIL_PASSWORD_PLAN.md` → `### Phase 1`.
- Depends on: spec 03 (`initAuth` options + `Auth`/`Session` exports), spec 05 (sole `initAuth` caller; the `initAuth<BetterAuthPlugin[]>({...})` call shape is frozen by its divergence 1), specs 09/10 (`getDatabasePath()` wiring, current `.env.schema` state).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: Discord and its OAuth plumbing (`oAuthProxy`, `socialProviders`, `productionUrl`, `discordClientId`/`discordClientSecret`) are gone from `packages/auth`, `apps/server`, both UIs, and the env schemas + generated `env.d.ts`; `initAuth` options are exactly `{ baseUrl: string; databaseUrl: string; secret: string | undefined; extraPlugins?: TExtraPlugins }`; the web `AuthShowcase` fallback is `fallback={null}` and `MobileAuth` renders `null` without a session (both filled by spec 12's forms); `AGENTS.md`/`README.md` no longer mention Discord; `specs/divergences/05-E-discord-oauth-unverified.md` is deleted and the two Discord items in `specs/done/05-E-apps-server-and-web.md` carry a `Superseded 2026-10-28` note with their checkboxes untouched.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Strip Discord and the OAuth plumbing from `packages/auth/src/index.ts` — requirements: delete the `oAuthProxy` import (`better-auth/plugins`) and its `plugins` entry — its only purpose was cross-origin OAuth callback proxying — so `plugins` becomes `[expo(), ...(options.extraPlugins ?? [])]`; delete the whole `socialProviders: { discord: {...} }` block; delete the `discordClientId`, `discordClientSecret` **and** `productionUrl` options from the `initAuth` options type (`productionUrl`'s only consumers were `oAuthProxy({ productionURL })` and the Discord `redirectURI`) — final options type exactly `{ baseUrl: string; databaseUrl: string; secret: string | undefined; extraPlugins?: TExtraPlugins }`; `initAuth` stays `async` returning `Promise<Auth>` and the `Auth`/`Session` exports are untouched (spec 05 divergence 1 froze the call shape); commands: `grep -ni "oAuthProxy\|socialProviders\|productionUrl\|discord" packages/auth/src/index.ts` (prints nothing)

- [x] 2. Update the sole `initAuth` call in `apps/server/src/index.ts` — requirements: drop the `productionUrl`, `discordClientId`, `discordClientSecret` lines (sole caller verified by grep this plan); the call becomes exactly:
  ```ts
  const auth = await initAuth<BetterAuthPlugin[]>({
    baseUrl: ENV.BETTER_AUTH_URL,
    databaseUrl: getDatabasePath(),
    secret: ENV.AUTH_SECRET,
  });
  ```
  commands: `grep -ni "productionUrl\|discord" apps/server/src/index.ts` (prints nothing)

- [x] 3. Cut the Discord keys out of the env schemas — requirements: root `.env.schema` deletes the `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET` entries — their two comment lines, their two `# @type=...` annotation lines, and the two value lines (currently at the file's tail, after `AUTH_SECRET`); `apps/server/.env.schema` line 1 pick list becomes exactly `# @import(../../, pick=[DATABASE_URL, BETTER_AUTH_URL, PORT, AUTH_SECRET])`; regenerate the generated types with `pnpm exec varlock codegen --path apps/server` — `apps/server/env.d.ts` is machine-generated (NEVER hand-edit) and must no longer declare `AUTH_DISCORD_ID`/`AUTH_DISCORD_SECRET`; a local `.env` may keep the two stray keys — delete those two lines only if `pnpm env:validate` complains (varlock resolves strictly from the schema; stray-key behavior is unverified); commands: `pnpm exec varlock codegen --path apps/server && pnpm env:validate`

- [x] 4. Delete the Discord entry point in the web UI — requirements: `apps/web/src/routes/index.tsx`, `AuthShowcase`: delete the `signIn` function and the fallback button block, leaving the fallback empty as `fallback={null}`; keep `signOut` and the signed-in block untouched (spec 12 replaces the fallback with the email/password form); commands: `grep -ni "signIn\|discord" apps/web/src/routes/index.tsx` (prints nothing)

- [x] 5. Delete the Discord entry point in the Expo UI — requirements: `apps/expo/src/app/index.tsx`, `MobileAuth`: remove the `authClient.signIn.social({ provider: "discord", ... })` branch; keep the greeting `Text`; render the `Pressable` only when a session exists, exactly:
  ```tsx
  {session ? <Pressable onPress={() => void authClient.signOut()} className="bg-primary flex items-center rounded-sm p-2"><Text className="text-foreground">Sign Out</Text></Pressable> : null}
  ```
  (the `null` branch becomes the form in spec 12); commands: `grep -ni "signIn\|discord" apps/expo/src/app/index.tsx` (prints nothing)

- [x] 6. Correct the docs and the spec record (factual corrections, not new docs) — requirements: `AGENTS.md` packages bullet replaces `packages/auth — better-auth on node:sqlite; Discord OAuth only (unconfigured in dev → sign-in returns 500), oAuthProxy + Expo plugins.` with `packages/auth — better-auth on node:sqlite; email & password only (no email sending), Expo plugin.`; `README.md`: (a) tree comment `better-auth on node:sqlite; oAuthProxy + Expo plugins, Discord provider` → `better-auth on node:sqlite; email & password, Expo plugin`; (b) delete the `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` env table row (one row or two — delete whichever exists); (c) replace `Both the web and Expo apps sign in (Discord OAuth or better-auth's email flows via authClient) and render the post list with TanStack Query.` with `Both the web and Expo apps sign in with email and password via authClient and render the post list.` (keep the existing `authClient` code formatting; the TanStack Query clause is dropped, not re-attributed — only Expo uses TanStack Query today); delete `specs/divergences/05-E-discord-oauth-unverified.md` — its blocking external prerequisite (Discord credentials) is void because the provider is gone; in `specs/done/05-E-apps-server-and-web.md` append exactly `Superseded 2026-10-28: the Discord provider was removed in favor of email & password; this criterion is void.` to the `- [ ]` criterion at line ~148 and to divergence 9 (line ~192) — do NOT flip the checkbox; the historical record stays honest; commands: `grep -rni discord . --include="*.ts" --include="*.tsx" --include="*.schema" --include="*.json" --include="*.md"` (run from `sb-stack-v1/`)

## 2. No-go

- Do not add `emailAndPassword` or any sign-in form (spec 12 owns it) — after this spec the apps have no sign-in vehicle; that is the intended intermediate state.
- Do not touch the boot-time better-auth migration (`getMigrations(...).runMigrations()` in `packages/auth/src/index.ts` stays until spec 13).
- Do not change the `initAuth` call shape, return type (`Promise<Auth>`), or the `Auth`/`Session` exports (frozen by spec 05 divergence 1).
- Do not hand-edit `apps/server/env.d.ts` (varlock-generated) and do not remove anything else from the env schemas.
- Do not flip the `- [ ]` boxes or rewrite history in `specs/done/05-E-apps-server-and-web.md`; do not delete the `apps/web/README.md` Solid-template community-chat Discord link (intentionally kept, not auth code).
- Do not add unit tests.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `pnpm lint && pnpm format && pnpm typecheck` exit 0 (repo root).
- [x] objectives 1–2: `grep -ni "oAuthProxy\|socialProviders\|productionUrl\|discord" packages/auth/src/index.ts apps/server/src/index.ts` prints nothing and `apps/server/src/index.ts`'s `initAuth` call matches objective 2 exactly (still `initAuth<BetterAuthPlugin[]>`).
- [x] objective 3: `pnpm exec varlock codegen --path apps/server` exits 0 and `grep -n "AUTH_DISCORD" .env.schema apps/server/.env.schema apps/server/env.d.ts` prints nothing; `pnpm env:validate` exits 0 (stray local `.env` keys removed only if it fails).
- [x] objectives 4–5: `grep -ni "signIn\|discord" apps/web/src/routes/index.tsx apps/expo/src/app/index.tsx` prints nothing; the stack is still bootable: `pnpm --filter @acme/server dev` logs `🦊 Elysia running at http://localhost:3000` and `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/ok` → `200`.
- [x] objective 6: from `sb-stack-v1/`, `grep -rni discord . --include="*.ts" --include="*.tsx" --include="*.schema" --include="*.json" --include="*.md"` prints nothing except `apps/web/README.md` (intentionally kept) and nothing at all under `packages/`, `apps/server/`, `apps/web/src/`, `apps/expo/src/` (plan Verification 6); `specs/divergences/05-E-discord-oauth-unverified.md` no longer exists; `specs/done/05-E-apps-server-and-web.md` shows the two `Superseded 2026-10-28: …` notes and its criterion box still `- [ ]`.
- [x] every objective in section 1 is checked (divergences, if any, appended here).

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

None.

### Unresolved divergences → `specs/divergences/`

*A divergence that stays OPEN because a later spec owns the fix MUST also get a
tracking file in `specs/divergences/`, so future agents can find and clear it.
Name it `<spec-id>-<short-slug>.md` (e.g.
`02-B-api-typecheck-lint-red.md`). Include: source spec + the exact criteria it
blocks, what is broken (files/imports), why each fix attempt was fenced, and a
"how to clear it" checklist naming the spec that resolves it plus the commands
to re-verify. Then link the tracking file from the matching Divergence entry
above (e.g. "**Tracked for future check-up in
`specs/divergences/<file>.md`**"). When the later spec lands and the checks
pass, mark the criteria `[x]` and remove the tracking file.*
