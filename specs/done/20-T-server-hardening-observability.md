# Spec 20 — Phase T: Server hardening + observability

- Source: sb-stack-v1 monorepo audit (2026-10-28), server-hardening and observability items.
- Depends on: specs 14-N (integration + e2e suites must stay green), 17-Q (web gates green). The 14-N suite's request patterns must fit the rate limits below.
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: `/healthz`, security headers, auth rate limiting, `/swagger` docs, request logging, and a production fail-fast on the placeholder `AUTH_SECRET`.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Add `GET /healthz` — requirements: public route in `@acme/api` (next to the post routes) returning 200 `{"ok":true}`; no auth middleware; wired in `createApp`; commands: `curl -sf http://localhost:3000/healthz`

- [x] 2. Add security headers — requirements: Elysia `onAfterHandle` in `createApp` setting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` always, and `Strict-Transport-Security: max-age=31536000; includeSubDomains` only when `NODE_ENV === "production"`; commands: `curl -sI http://localhost:3000/healthz | grep -iE 'x-content-type|x-frame|referrer'`

- [x] 3. Rate-limit auth endpoints — requirements: in-memory per-IP limiter on `/api/auth/*` (60 requests/minute, auth routes only), returning 429 with a JSON `{error}`; must not break the 14-N suite (7 sequential requests — verify) or the web e2e; commands: `pnpm --filter @acme/server test`

- [x] 4. Mount OpenAPI docs — requirements: `@elysiajs/swagger` catalog entry + mounted in `createApp` at `/swagger`; commands: `curl -sf http://localhost:3000/swagger/json | head -c 100`

- [x] 5. Add request logging — requirements: minimal onRequest/onResponse middleware logging method, path, status, and duration in ms to stdout, silenced when `NODE_ENV === "test"`; no new dependency; commands: boot the server, hit a route, observe one log line

- [x] 6. Fail fast on the placeholder secret in production — requirements: at boot, if `NODE_ENV === "production"` and `AUTH_SECRET` is unset or equals `local-dev-placeholder-not-for-prod` (whatever the resolved value is), exit non-zero with a message naming the variable; dev/CI unaffected; commands: `NODE_ENV=production AUTH_SECRET=local-dev-placeholder-not-for-prod bun apps/server/src/index.ts` → exits non-zero with the message

## 2. No-go

- Do not change auth behavior, route paths, or the 14-N test expectations.
- Do not add external services (Sentry, hosted logging, APM) or new logging deps.
- Do not rate-limit non-auth routes.
- Do not disable the rate limiter to make tests pass by rewriting the suite — only a deliberate, documented env toggle (e.g. `RATE_LIMIT_DISABLED=1` for the test bootstrap) may be used, and only if a real breakage is proven.
- Do not write unit tests; verify through the integration suite, e2e, and curls.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `curl -sf http://localhost:3000/healthz` → `{"ok":true}`. — verified against a live `bun apps/server/src/index.ts` boot.
- [x] `curl -sI http://localhost:3000/healthz` shows the three always-on headers. — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` present (3/3), no `Strict-Transport-Security` outside production; the `/swagger` UI route carries them too.
- [x] `pnpm --filter @acme/server test` → all 7 cases pass (rate limiter survives the suite). — 7 pass / 0 fail; the suite makes 7 `/api/auth/*` requests (well under 60/min), and request logging stays silent under `bun test`.
- [x] `pnpm --filter @acme/web e2e` → 2 tests pass. — 2 passed; Playwright's readiness poll plus both specs stay under the auth limit (no `RATE_LIMIT_DISABLED` toggle needed).
- [x] `curl -sf http://localhost:3000/swagger/json` returns JSON. — OpenAPI 3.0.3 document listing `/healthz`, `/api/protected` and the `/api/posts` routes.
- [x] Hammering `/api/auth/ok` >60× within a minute → 429 (manual check). — 65 rapid curls → 60×200 then 5×429, body `{"error":"Too many requests"}`; blocked requests are logged with status 429.
- [x] `NODE_ENV=production AUTH_SECRET=local-dev-placeholder-not-for-prod bun apps/server/src/index.ts` exits non-zero with the placeholder message. — exit 1, prints `AUTH_SECRET is unset or still set to the local-dev placeholder; refusing to start in production.`; with a real secret the production boot proceeds, dev/CI untouched.
- [x] `pnpm lint && pnpm format && pnpm typecheck` exit 0. — each exits 0 workspace-wide; `typecheck` first required moving a stale gitignored `apps/web/dist/client` build aside, which predates this spec (Divergence 2; its config root cause was since fixed — see the RESOLVED note there).
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

1. `@elysiajs/swagger` is pinned to `1.0.5` in the `pnpm-workspace.yaml` catalog, and the `use()` call is cast to `(app: Elysia) => Elysia` in `packages/api/src/index.ts` — objective 4 only mandates a "catalog entry + mounted at `/swagger`", but the current line of the plugin does not work in this repo: `1.1+`/`1.3.1` depends on `@scalar/*`, and `@scalar/types` calls `z.function().returns`, which no longer exists in the zod `4.6.7` forced by the `zod@<4` security override (spec 18-R), so the server crashed at import; `1.0.5` has no Scalar dependency and serves `/swagger` + `/swagger/json` fine, but its `.d.ts` predates Elysia 1.4's generics (8 positional type args, hidden by `skipLibCheck`), and letting that return type merge through `.use()` poisoned `App`'s route map, breaking Eden inference in `apps/web` and `apps/expo`. (Verified 2026-10-29: attempt 1 = install `1.3.1` → boot crash in `@scalar/types`; attempt 2 = pin `1.0.5` → boot + `/swagger/json` green, but `@acme/expo`/`@acme/web` typecheck/lint red; attempt 3 = pin the plugin's type to the empty-schema shape at the `use()` call → workspace typecheck + lint green and all criteria pass. Do not bump `@elysiajs/swagger` past `1.0.5` without first moving off the zod security override or patching `@scalar/types`; both would regress spec 18-R.)

2. `pnpm typecheck` was already red in this working tree before spec 20 ran: the gitignored `apps/web/dist/client` build output (dated 2026-10-28) is typechecked, because `tooling/typescript/base.json`'s `"exclude": […, "dist", …]` resolves relative to the base config file, not to `apps/web`. Proven pre-existing with a clean worktree at HEAD: `pnpm typecheck` exits 0 without `dist` and reports 3247 errors once the same `dist` is copied in — so spec 20 did not create it. Resolved for this spec by moving the stale artifact aside (the repo's own `clean` target runs `git clean -xdf … dist`); the latent trigger remains: any `pnpm --filter @acme/web build` recreates `apps/web/dist` and turns the workspace `typecheck` red again. ~~**Tracked for future check-up in `specs/divergences/20-T-web-typecheck-dist-artifact.md`.**~~ **RESOLVED 2026-10-29** — the config bug was fixed at the root (deviating from the tracking file's app-local suggestion): `tooling/typescript/base.json` now anchors its exclude list with `${configDir}` (`"${configDir}/dist"` etc.), so each project excludes its own build output. Re-verified: `pnpm --filter @acme/web build && pnpm typecheck` exits 0 with `apps/web/dist` present, and `pnpm typecheck` passes for every package. Tracking file deleted. (Verified 2026-10-29: 1 fix attempt — remove the stale build artifact — which clears the criterion as executed; a tsconfig fix is fenced by this spec's Testing rule "NEVER improvise outside the objectives", so the config hardening was deferred to the owner named in the tracking file.)

### Unresolved divergences → `specs/divergences/`

*A divergence that stays OPEN because a later spec owns the fix MUST also get a
tracking file in `specs/divergences/`, so future agents can find and clear it.
Name it `<spec-id>-<short-slug>.md` (e.g.
`02-B-api-typecheck-lint-red.md`). Include: source spec + the exact criteria it
blocks, what is broken (files/imports), why each fix attempt was fenced, and a
"how to clear it" checklist naming the spec that resolves it plus the commands
to re-verify. Then link the tracking file from the matching Divergence entry
above (e.g. "**Tracked for future check-up in
`specs/divergences/<file>.md`.**"). When the later spec lands and the checks
pass, mark the criteria `[x]` and remove the tracking file.*
