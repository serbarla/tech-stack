# Spec 19 — Phase S: Docker/compose hardening — fresh-clone build, healthchecks, API proxy, CI image build

- Source: sb-stack-v1 monorepo audit (2026-10-28), finding 2 plus the compose/proxy gaps.
- Depends on: specs 15-O and 16-P (one lockfile, frozen install) so image builds are reproducible. Uses the existing `/api/auth/ok` route for the healthcheck (spec 20-T adds the app-level `/healthz`).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: `docker compose up --build` works from a fresh clone with only secrets supplied via shell; both services have healthchecks; the web container proxies `/api` to the server so same-origin deployments work without a web rebuild for the API host; CI builds both images.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Make the server image build from a fresh clone — requirements: `Dockerfile.server` must not `COPY .varlock-frozen-env` (gitignored, absent on fresh clones). First verify how varlock resolves env at runtime, then pick the boring mechanism: either (a) pass `AUTH_SECRET`/`BETTER_AUTH_URL`/`PORT` through compose `environment` and drop the frozen-env switch, or (b) generate the frozen file inside the image/entrypoint via `pnpm env:freeze` with the key from `_VARLOCK_ENV_KEY`. Either way the container must boot with the secret coming from the operator's shell/`.env`, never committed; commands: simulate a fresh clone with `mv .varlock-frozen-env /tmp/sb-frozen-env.bak && docker compose build server && docker compose up -d server && curl -sf http://localhost:3000/api/auth/ok`, then restore the file

- [x] 2. Add healthchecks to `docker-compose.yml` — requirements: server `healthcheck` hitting `/api/auth/ok` (e.g. `bun -e 'process.exit((await fetch("http://127.0.0.1:3000/api/auth/ok")).ok ? 0 : 1)'`); web `healthcheck` on the nginx image using busybox wget against port 80; web `depends_on: server: condition: service_healthy`; commands: `docker compose up -d --build && docker compose ps` shows both `healthy`

- [x] 3. Proxy `/api` through the web container — requirements: add an nginx config in the web image (`/etc/nginx/conf.d/default.conf`) that serves `/` from the static bundle and `proxy_pass`es `/api/` → `http://server:3000`; document that same-origin deployments set `VITE_API_URL` to the public origin (e.g. `http://host:3001`) at web build time; do NOT change the web app's runtime env resolution (relative URLs are out of scope); commands: `curl -sf http://localhost:3001/api/posts` returns the server's JSON

- [x] 4. Add a `docker` job to `.github/workflows/ci.yml` — requirements: runs `docker compose build` (both images) after the shared setup action; image build must not need secrets; commands: `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'`

- [x] 5. Update README Docker/Deployment sections — requirements: document the one-time secret flow (which env var compose reads, e.g. `AUTH_SECRET` or `_VARLOCK_ENV_KEY`), the healthchecks, the proxy, and remove any stale "frozen env" instructions; commands: `grep -n "healthcheck\|AUTH_SECRET" README.md`

## 2. No-go

- Do not commit `.varlock-frozen-env`, `.env`, `.env.local`, or any real secret.
- Do not change the server port (3000) or web port (3001).
- Do not switch the web runtime to relative API URLs (keep `ENV.VITE_API_URL`).
- Do not move the web build back into the server image.
- Do not add Docker build jobs beyond the single `docker` job.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] Objective 1 simulation: build succeeds with `.varlock-frozen-env` absent; `curl -sf http://localhost:3000/api/auth/ok` returns 200.
- [x] `docker compose ps` shows `server` and `web` both `healthy`.
- [x] `curl -sf http://localhost:3001/api/posts` returns the server's JSON (proxy works).
- [x] `curl -sf http://localhost:3001/` serves the built web bundle.
- [x] `docker compose build` exits 0 locally (CI-equivalent command).
- [x] `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'` prints `ok`; the file contains the `docker` job.
- [x] `grep -n "healthcheck\|AUTH_SECRET" README.md` documents the flow.
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
