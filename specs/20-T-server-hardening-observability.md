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

- [ ] 1. Add `GET /healthz` — requirements: public route in `@acme/api` (next to the post routes) returning 200 `{"ok":true}`; no auth middleware; wired in `createApp`; commands: `curl -sf http://localhost:3000/healthz`

- [ ] 2. Add security headers — requirements: Elysia `onAfterHandle` in `createApp` setting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` always, and `Strict-Transport-Security: max-age=31536000; includeSubDomains` only when `NODE_ENV === "production"`; commands: `curl -sI http://localhost:3000/healthz | grep -iE 'x-content-type|x-frame|referrer'`

- [ ] 3. Rate-limit auth endpoints — requirements: in-memory per-IP limiter on `/api/auth/*` (60 requests/minute, auth routes only), returning 429 with a JSON `{error}`; must not break the 14-N suite (7 sequential requests — verify) or the web e2e; commands: `pnpm --filter @acme/server test`

- [ ] 4. Mount OpenAPI docs — requirements: `@elysiajs/swagger` catalog entry + mounted in `createApp` at `/swagger`; commands: `curl -sf http://localhost:3000/swagger/json | head -c 100`

- [ ] 5. Add request logging — requirements: minimal onRequest/onResponse middleware logging method, path, status, and duration in ms to stdout, silenced when `NODE_ENV === "test"`; no new dependency; commands: boot the server, hit a route, observe one log line

- [ ] 6. Fail fast on the placeholder secret in production — requirements: at boot, if `NODE_ENV === "production"` and `AUTH_SECRET` is unset or equals `local-dev-placeholder-not-for-prod` (whatever the resolved value is), exit non-zero with a message naming the variable; dev/CI unaffected; commands: `NODE_ENV=production AUTH_SECRET=local-dev-placeholder-not-for-prod bun apps/server/src/index.ts` → exits non-zero with the message

## 2. No-go

- Do not change auth behavior, route paths, or the 14-N test expectations.
- Do not add external services (Sentry, hosted logging, APM) or new logging deps.
- Do not rate-limit non-auth routes.
- Do not disable the rate limiter to make tests pass by rewriting the suite — only a deliberate, documented env toggle (e.g. `RATE_LIMIT_DISABLED=1` for the test bootstrap) may be used, and only if a real breakage is proven.
- Do not write unit tests; verify through the integration suite, e2e, and curls.

## 3. Testing criteria

*All boxes checked = spec done.*

- [ ] `curl -sf http://localhost:3000/healthz` → `{"ok":true}`.
- [ ] `curl -sI http://localhost:3000/healthz` shows the three always-on headers.
- [ ] `pnpm --filter @acme/server test` → all 7 cases pass (rate limiter survives the suite).
- [ ] `pnpm --filter @acme/web e2e` → 2 tests pass.
- [ ] `curl -sf http://localhost:3000/swagger/json` returns JSON.
- [ ] Hammering `/api/auth/ok` >60× within a minute → 429 (manual check).
- [ ] `NODE_ENV=production AUTH_SECRET=local-dev-placeholder-not-for-prod bun apps/server/src/index.ts` exits non-zero with the placeholder message.
- [ ] `pnpm lint && pnpm format && pnpm typecheck` exit 0.
- [ ] every objective in section 1 is checked.

## 4. Divergences

*REQUIRED at the end of every spec. If reality diverged from this spec while
executing it, append a numbered entry here — do not silently drop it and do not
edit the objectives to match what you actually did. Each entry: what diverged,
why, the fix attempt(s), and (if unresolved) a pointer to a tracking file. Keep
the `- [ ]` testing-criteria box unchecked and note the divergence inline next
to it, exactly as in `specs/02-B-database-drizzle-to-mikroorm-kysely.md`.*

- [ ] every divergence found is appended below (or the section reads "None.")

*Format (one numbered item per divergence):*

1. <what diverged and its current state> — <why it could not be done as
   written, citing the No-go rule or spec that blocks it> (Verified <date>:
   <N> fix attempts — <attempt 1>, <attempt 2>, <attempt 3> — all fenced by
   <constraint>; <impact> is deferred to <later spec> by design, not a defect.)

### Divergences

None yet — to be filled in at execution time.

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
