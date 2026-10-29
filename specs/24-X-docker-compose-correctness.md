# Spec 24 — Phase X: Docker compose correctness

- Source: sb-stack-v1 release audit (2026-10-29), Docker/compose should-fixes.
- Depends on: spec 23-W (fail-fast boot in the container).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: build context is small and secret-free, the server container runs as `bun`, compose cannot wedge its own healthcheck or ship a silent localhost API URL, base images are patch-pinned, CI smoke-boots the stack.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Fix `.dockerignore` context leaks — requirements: root-only patterns leak per-package `node_modules`, `dist`, `.cache`, `test-results` into the build context (Go `filepath.Match`, no `**`); replace with `**/node_modules`, `**/dist`, `**/.cache`, `**/test-results`, `**/playwright-report`, `**/.expo`, `**/.expo-shared`, `apps/expo/ios`, `apps/expo/android`, `.nx`, `data`; keep existing env/secret ignores; commands: edit `.dockerignore`
- [x] 2. Harden `Dockerfile.server` run stage — requirements: delete the redundant `COPY --from=deps /app/node_modules ./node_modules` (subsumed by `COPY --from=deps /app ./`); add `RUN mkdir -p /data && chown bun:bun /data`, then `USER bun` before `CMD`; commands: edit `Dockerfile.server`
- [x] 3. Stop passing `PORT` through compose — requirements: drop `PORT` from the server `environment` passthrough list (the port map `3000:3000` and healthcheck URL hardcode 3000, so a passed-through `PORT` wedges the healthcheck); document 3000 as the fixed container port in the README Docker section; commands: edit `docker-compose.yml`, `README.md`
- [x] 4. Require `VITE_API_URL` at web build — requirements: compose web build args `VITE_API_URL: ${VITE_API_URL:?set VITE_API_URL to the public web origin (e.g. http://host:3001)}`; `Dockerfile.web` after `ARG VITE_API_URL` add `RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL build-arg is required" && exit 1)`; no silent `http://localhost:3000` inside a production bundle; README Docker section updated; commands: edit `docker-compose.yml`, `Dockerfile.web`, `README.md`
- [x] 5. Pin base image tags to current patch releases — requirements: `node:22.<x>`, `oven/bun:1.<x>`, `nginx:1.<y>-alpine` resolved at execution (`node:22.23.4`, `oven/bun:1.4.4`, `nginx:1.30.6-alpine`); commands: edit `Dockerfile.server`, `Dockerfile.web`
- [x] 6. Smoke-boot the stack in CI — requirements: `.github/workflows/ci.yml` docker job build step gains `env: VITE_API_URL: http://localhost:3001`; after `docker compose build`, smoke-boot: `docker compose up -d --wait`, `curl -sf http://localhost:3000/api/auth/ok`, `curl -sf http://localhost:3001/`, `docker compose ps` (both healthy), `docker compose down -v`; commands: edit `.github/workflows/ci.yml`

## 2. No-go

- Do not change the Phase 1 boot-guard semantics or messages.
- No release/publish workflow additions.
- Do not restructure the compose services (server + web only).

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] `docker compose build web` without `VITE_API_URL` → fails with the message; `VITE_API_URL=http://localhost:3001 docker compose build` → exit 0.
- [x] `export AUTH_SECRET=$(openssl rand -base64 32) VITE_API_URL=http://localhost:3001 && docker compose up -d --wait` → both services `healthy`; `curl -sf http://localhost:3001/api/posts` returns JSON through the nginx proxy.
- [ ] `docker compose run --rm --no-deps --entrypoint id server` prints `uid=1000(bun)`; DB file in `./data` is not root-owned. (divergence 1: the DB now lives in the `sb-data` named volume, owned `1000:1000` by bun — verified there; host `./data` is not touched by compose; `id` verified `uid=1000(bun)`.)
- [x] `docker compose build --progress=plain` shows a small context transfer (a few MB — no `node_modules` upload).
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

1. Contingency C5 fired: compose now mounts the named volume `sb-data:/data`
   instead of the `./data` bind mount (objective 2's `USER bun` interplay). The
   bind mount works on macOS (VirtioFS uid mapping) but not on Linux hosts: the
   docker daemon auto-creates a missing bind source as `root:root 0755`, which
   the non-root `bun` user (uid 1000) cannot write to, so the boot migration
   dies with `ERR_SQLITE_ERROR "unable to open database file"` (the same
   failure mode as fresh-clone blocker 2). Reproduced with real Linux VFS
   semantics in a container from the built image (Verified 2026-10-29: 2 fix
   attempts — attempt 1 simulated the root-owned dir via a plain named volume
   but moby's empty-volume init-copy re-owned it from the image at the next
   mount, voiding the test; attempt 2 seeded a file first (`touch /data/.keep`)
   so the init-copy no longer re-owns the dir, then `chown root:root /data &&
   chmod 755 /data` and ran the migration as `--user 1000:1000` →
   `migrate_exit=1` "unable to open database file"; the named-volume control
   (fresh volume, bun-owned via the image's `chown bun:bun /data`) migrates
   successfully with `sqlite.db` owned `1000:1000`). The plan's own release
   proof requires the CI smoke boot green on `ubuntu-latest`, which this
   deterministic Linux behavior would break, so the sanctioned C5 remedy is
   applied now. The testing criterion "DB file in `./data` is not root-owned"
   is kept unchecked inline (the DB no longer lives in `./data`); the
   replacement evidence: `docker compose exec server ls -ln /data` shows
   `sqlite.db` owned `1000:1000` (bun), and host `./data` is byte-identical
   before/after a compose run (`diff -rq`). README documents `docker compose
   cp server:/data/sqlite.db ./data/sqlite.db` for DB inspection per C5.

2. The written smoke-boot commands (objective 6 and the local verification
   line) run `docker compose` without the env that this plan's own guards now
   require: the Phase 1 fail-fast boot refuses missing `AUTH_SECRET` and
   localhost/missing `BETTER_AUTH_URL`, and objective 4's
   `${VITE_API_URL:?…}` interpolation makes every compose command (not just
   builds) fail when `VITE_API_URL` is unset — observed when `docker compose
   down -v` died with the interpolation error. Resolved by exporting ephemeral
   values in the smoke paths (`AUTH_SECRET="$(openssl rand -base64 32)"`,
   `BETTER_AUTH_URL=http://server:3000` in CI / `http://host.example:3000`
   locally, `VITE_API_URL=http://localhost:3001`); no secrets are committed
   and the boot guards stay untouched (No-go). (Verified 2026-10-29: 1 fix
   attempt — adding the three exports to the CI smoke step and the local
   command — no constraint fenced it.)

3. `.dockerignore` keeps the pre-existing `.git` and `.vp` ignores beyond the
   objective's replacement list (the list enumerates the artifact globs and
   env/secret ignores): dropping `.git` would push the full repo history into
   the build context, breaking the small-context criterion; `.vp` is a local
   tool cache. (Verified 2026-10-29: no fix attempt needed — retained
   deliberately.)

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
