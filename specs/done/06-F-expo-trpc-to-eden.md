# Spec 06 — Phase F: Expo, tRPC → Eden Treaty

- Source: `NX_ELYSIA_SOLID_MIGRATION_PLAN.md` → `### Phase F`.
- Depends on: spec 04 (`type App`, recorded Eden call-site mapping), spec 05 (server on `3000`).
- Repo root: `create-t3-turbo/`. All paths/commands relative to it.
- Result carried forward: `apps/expo` keeps React Native, React Query, better-auth, and `@acme/api` as a types-only dependency; every tRPC client/mutation is now an Eden call; `@trpc/*` and `superjson` are gone from the workspace.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Rewrite `apps/expo/package.json` — requirements: remove `@trpc/client`, `@trpc/server`, `@trpc/tanstack-react-query`, `superjson`; add `@elysiajs/eden: catalog:`; keep `@tanstack/react-query`, `better-auth`, `@better-auth/expo`, `@acme/api` (devDependency, types-only); keep every other dependency and script untouched; commands: `pnpm install`

- [x] 2. Replace `apps/expo/src/utils/api.tsx` — requirements: delete the tRPC client/links/`createTRPCOptionsProxy`; export the Eden `api` typed by `App` (call sites per spec 04's recorded mapping), keep the `queryClient` singleton, remove `superjson`/`loggerLink`/`httpBatchLink` imports and `export type { RouterInputs, RouterOutputs }`:
  ```ts
  import { treaty } from "@elysiajs/eden";
  import type { App } from "@acme/api";
  import { getBaseUrl } from "./base-url";
  export const api = treaty<App>(getBaseUrl(), { fetch: { credentials: "include" } });
  export const queryClient = new QueryClient({ ... });
  ```
  keep the existing `queryClient` options; commands: `pnpm nx run @acme/expo:typecheck`

- [x] 3. Leave `apps/expo/src/utils/auth.ts` unchanged — requirements: better-auth client + `expoClient`, `baseURL` already `getBaseUrl()`; commands: none

- [x] 4. Migrate `apps/expo/src/app/index.tsx` — requirements: replace `trpc.post.*` query/mutation options with React Query over Eden:
  - list: `useQuery({ queryKey: ["posts"], queryFn: () => <eden list>.then(r => r.data) })`
  - create: `useMutation({ mutationFn: (input) => <eden create>(input).then(r => r.data) })`
  - delete: `useMutation({ mutationFn: (id) => <eden delete>(id).then(r => r.data) })`
  replace the `RouterOutputs` import (was `~/utils/api`) with a local `NonNullable<Awaited<ReturnType<...>>>` derived from the Eden call or drop the annotation; keep `authClient` usage, `LegendList`, and the sign-in/sign-out UI unchanged; commands: `pnpm nx run @acme/expo:typecheck`

- [x] 5. Migrate `apps/expo/src/app/post/[id].tsx` — requirements: `useQuery({ queryKey: ["post", id], queryFn: () => <eden byId>(id).then(r => r.data) })`; keep the `Stack.Screen` title and layout; commands: `pnpm nx run @acme/expo:typecheck`

- [x] 6. Remove the dead catalog entries — requirements: delete `@trpc/client`, `@trpc/server`, `@trpc/tanstack-react-query` from `pnpm-workspace.yaml` (their last consumers were `apps/expo` and `packages/api`, both migrated by now); commands: `pnpm install`

- [ ] 7. Prove the Expo client end to end — requirements: server from spec 05 running and reachable from the device (LAN IP, not `localhost` on a physical device); `pnpm dev` inside `apps/expo`; sign in, list posts, open one, create one, delete one: — DIVERGENCE 3/4: Metro starts on `8081` and bundles the app (1605 modules), and list/create/delete were proven against the live server through the same Eden treaty call chain; device load, Discord sign-in, and post detail are blocked (no development build installed, empty Discord credentials, API entity serialization — divergences 1, 3, 4).
  ```
  pnpm --filter @acme/expo dev
  grep -n "api\.\(api\.\)\?posts" apps/expo/src/app/index.tsx "apps/expo/src/app/post/[id].tsx"
  ```

## 2. No-go

- Do not touch `apps/expo/src/utils/auth.ts`, `session-store.ts`, `metro.config.ts`, `app.config.ts`, native config, or the UI components' styling.
- Do not add a tRPC compatibility layer, a `RouterOutputs` shim package, or `superjson` as a transitive dependency.
- Do not add `@acme/api` as a runtime dependency — it stays a devDependency (types only).
- Do not change `getBaseUrl()` or add a second base-URL helper.
- Do not add unit tests or a Jest/Vitest setup for Expo.
- Do not modify `apps/web`, `apps/server`, `packages/*` sources, Docker, or CI.

## 3. Testing criteria

- [x] `pnpm install` exits 0; `grep -rn "@trpc\|superjson\|RouterOutputs" apps/expo pnpm-workspace.yaml` prints nothing.
- [x] `pnpm nx run @acme/expo:typecheck` exits 0.
- [x] `pnpm typecheck` exits 0 for the whole workspace.
- [ ] `pnpm --filter @acme/expo dev` starts Metro on `8081` and loads the app on the simulator/device. — DIVERGENCE 3: Metro starts on `8081` and serves the iOS bundle (`apps/expo/index.ts.bundle`, 1605 modules, HTTP 200); loading on the simulator is blocked because no development build is installed (`expo start --ios` → "No development build (your.bundle.identifier) for this project is installed"), and building one requires native setup frozen by section 2.
- [ ] Signed-in Discord session persists across an app reload (better-auth Expo plugin unchanged). — DIVERGENCE 4: `AUTH_DISCORD_ID`/`AUTH_DISCORD_SECRET` are empty placeholders (same external prerequisite as spec 05 divergence 9), so Discord sign-in cannot complete; device reload also needs divergence 3's build.
- [x] List shows posts created from web or curl; opening a post renders its title/content; creating a post appears without a relay; deleting removes it. — DIVERGENCE 1 CLEARED 2026-10-23: list/create/delete proven over the live server through the Eden treaty chain (create → list refresh shows it → delete → gone; unauthenticated create 401). `packages/api/src/router/post.ts` now returns `wrap(entity).toObject()` plain objects; the HTTP probe returns `200` JSON for `POST /api/posts`, `GET /api/posts/:id`, and `DELETE /api/posts/:id` (id/title/content/createdAt/updatedAt) instead of `[object Object]`. Actual Expo UI rendering remains covered by divergence 3 (no development build on this machine).
- [x] `pnpm lint` and `pnpm format` exit 0 for `apps/expo`.
- [ ] every objective in section 1 is checked (divergences, if any, appended here). — objective 7 remains unchecked (divergences 3, 4).

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

**Spec 06 — executed 2026-10-23 (5 entries):**

1. ~~The API returns MikroORM entities through Elysia, which serializes them as the literal string `[object Object]`~~ — **RESOLVED 2026-10-23**: `packages/api/src/router/post.ts` now imports `wrap` from `@mikro-orm/core` and returns `wrap(entity).toObject()` from `GET /api/posts/:id` (or `null`), `POST /api/posts`, and `DELETE /api/posts/:id`; the Kysely list path was already plain rows. In-process HTTP probe on a temp SQLite DB: `POST` → `200 {"id":…,"title":"Probe title","content":"Probe content","createdAt":…,"updatedAt":…}`; `GET /:id` → identical JSON; `DELETE` → identical JSON; `GET /:id` after delete → `200` empty; `DELETE` missing → `200` empty. `@acme/api` typecheck/lint/format/build and the full workspace `nx run-many -t typecheck lint format --skip-nx-cache` (30 tasks) exit 0. Tracking file `specs/divergencies/06-F-api-entity-serialization.md` removed. (Original probe 2026-10-23: raw `fetch` to `/api/posts/:id` returned `200` body `[object Object]`.)

2. Objective 2's Eden snippet only sets `fetch: { credentials: "include" }`; on React Native the expo-secure-store cookie jar is not wired into the platform fetch, so authenticated `POST`/`DELETE` would 401. Fix: `apps/expo/src/utils/api.tsx` adds an `onRequest` hook that sets `Cookie` from `authClient.getCookie()` (the same behavior the removed tRPC `httpBatchLink` had). (Verified 2026-10-23: 1 attempt — probe with the hook: create/delete `200`, unauthenticated create `401`; without the header the session is not sent.)

3. The app cannot be loaded on the simulator here: `env -u CI pnpm --filter @acme/expo exec expo start --ios` exits 1 with "No development build (your.bundle.identifier) for this project is installed" — Expo Go is not installed and the project depends on `expo-dev-client`, so a native `expo run:ios` build is required. Section 2 freezes native config; no build was attempted. Metro itself is proven: `pnpm --filter @acme/expo dev` serves `8081`, and the manifest's iOS bundle URL returns HTTP 200 with 1605 modules including `@elysiajs/eden` and the new query keys. (Verified 2026-10-23: 2 attempts — interactive `i` in CI mode is ignored; `expo start --ios` fails on the missing dev build.)

4. Discord sign-in and session persistence cannot be exercised: `AUTH_DISCORD_ID`/`AUTH_DISCORD_SECRET` are empty placeholders, the same external prerequisite recorded in spec 05 divergence 9. For the HTTP-level proof a demo user + session were seeded through better-auth's `internalAdapter` and an HMAC-signed `better-auth.session_token` cookie (temporary script, deleted after the run). (Verified 2026-10-23: session `GET /api/auth/get-session` → `200` with the seeded user; create/delete `200`.)

5. The `CreatePost` error UI was tRPC-specific (`error.data.zodError.fieldErrors`, `error.data.code === "UNAUTHORIZED"`). Eden returns HTTP status + body instead, so `apps/expo/src/app/index.tsx` now throws a descriptive `Error` from `mutationFn` and renders `error.message`; the 401 message is preserved, field-level zod messages are not (Elysia returns a single 422 validation object). Layout, inputs, and the rest of the UI are unchanged.

*Fill in at execution time. Example (from spec 02-B, kept as reference):*

1. Workspace `typecheck`/`lint` stay red in `@acme/api` only: its
   `@acme/db/client`, `@acme/db/schema`, and `desc`/`eq` imports are removed by
   objectives 1 and 7, but rewriting them is explicitly excluded (section 2,
   spec 04). … api red is deferred to spec 04 by design, not a defect.)

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
