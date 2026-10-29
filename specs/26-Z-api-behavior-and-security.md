# Spec 26 — Phase Z: API behavior and security

- Source: sb-stack-v1 release audit (2026-10-29), API should-fixes.
- Depends on: spec 23-W (boot guard), spec 24-X (compose env shape).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: rate-limit buckets keyed by socket address (not spoofable), CORS/better-auth origins env-driven, missing posts 404 with a shared row shape, swagger hidden in production, migrations shipped as a runtime dependency.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Key the rate limiter by socket address — requirements: `packages/api/src/rate-limit.ts` replaces the XFF-first-entry bucket key (client-spoofable — nginx appends, port 3000 is directly exposed) with the socket address: `const ip = server?.requestIP(request)?.address ?? "unknown"` (fallback contingency C3: last proxy-appended XFF entry if `requestIP` is unavailable); keep 60/min, `/api/auth/*` scope, 429 body `{"error":"Too many requests"}`; commands: edit `packages/api/src/rate-limit.ts`
- [x] 2. Env-driven origins — requirements: root `.env.schema` gains `CORS_ORIGINS` (string, default `http://localhost:3001`, description: comma-separated allowed web origins) picked by `apps/server/.env.schema`; regenerate `apps/server/env.d.ts` via `pnpm env:validate` — never hand-edit; `packages/api/src/index.ts` `createApp` options gain `corsOrigins?: string[]` (default `["http://localhost:3001"]`) used as the CORS `origin` list; `packages/auth/src/index.ts` `initAuth` options gain `trustedOrigins?: string[]` (default `["expo://", "http://localhost:3001"]`); sole caller `apps/server/src/index.ts` passes `corsOrigins: ENV.CORS_ORIGINS.split(",").map((s) => s.trim())` and `trustedOrigins: ["expo://", ...parsed]`; commands: edit `.env.schema`, `apps/server/.env.schema`, `packages/api/src/index.ts`, `packages/auth/src/index.ts`, `apps/server/src/index.ts`, `pnpm env:validate`
- [x] 3. Missing posts 404 + list/detail key parity — requirements: `packages/api/src/router/post.ts`: missing post on `GET /api/posts/:id` and `DELETE /api/posts/:id` → `status(404, { error: "Post not found" })` (Elysia `status()` helper — same pattern as `middleware.ts`'s `status(401)`); `GET /api/posts` list rows map/alias `created_at`/`updated_at` → `createdAt`/`updatedAt` so list items share the exact key set of `wrap(post).toObject()`; first `grep -rn "created_at\|updated_at" apps/` — if any hit, update it in this step (grep empty, no client updates); commands: grep, edit `packages/api/src/router/post.ts`
- [x] 4. Swagger only outside production — requirements: `packages/api/src/index.ts` mounts swagger only when `process.env.NODE_ENV !== "production"` (keep the pinned `1.0.5` + `(app: Elysia) => Elysia` cast); `/swagger` returns 404 in production; commands: edit `packages/api/src/index.ts`
- [x] 5. Ship migrations as a runtime dependency — requirements: `packages/db/package.json` moves `@mikro-orm/migrations` devDependencies → dependencies (migrations run at container boot via the Docker CMD); sync lockfile; commands: edit `packages/db/package.json`, `pnpm install --no-frozen-lockfile`
- [x] 6. Posts integration coverage — requirements: extend `apps/server/test/auth-flow.test.ts` with a posts describe: create → `GET :id` keys are exactly `{id,title,content,createdAt,updatedAt}` → list items share those keys → `DELETE :id` → list empty → `GET`/`DELETE` of a missing id → 404 `{"error":"Post not found"}`; commands: edit `apps/server/test/auth-flow.test.ts`

## 2. No-go

- Do not change the 60/min limit, the `/api/auth/*` scope, or the 429 body.
- Do not remove the swagger plugin or upgrade `@elysiajs/swagger` past 1.0.5 (spec 20-T divergence 1).
- Do not change the `middleware.ts` 401 behavior.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `pnpm --filter @acme/server test` — 7 existing + new posts cases pass.
- [x] Boot + `curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/posts/999999` → `404`; `curl -s localhost:3000/api/posts` items carry `createdAt` (not `created_at`).
- [x] `CORS_ORIGINS=http://localhost:3001,http://localhost:3002` boot; `curl -sI -H "Origin: http://localhost:3002" localhost:3000/healthz | grep -i access-control-allow-origin` echoes that origin.
- [x] Spoof-bypass closed: 61 requests with rotating `-H "X-Forwarded-For: 1.2.3.$i"` to `/api/auth/ok` → some return `429` (previously all 200).
- [x] `NODE_ENV=production AUTH_SECRET=<real> BETTER_AUTH_URL=http://host:3000 bun apps/server/src/index.ts` then `curl -s -o /dev/null -w "%{http_code}" localhost:3000/swagger` → `404`; without NODE_ENV=production `/swagger/json` still returns the OpenAPI doc.
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

None.

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
