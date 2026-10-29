# Spec 23 — Phase W: Deploy-safety blockers

- Source: sb-stack-v1 release audit (2026-10-29), blocker items 1–3 + their docs/CI fallout.
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: the shipped container boots with `NODE_ENV=production` (boot guard + HSTS active), first-run `pnpm db:migrate` works on a fresh clone, production boot refuses a localhost/unset `BETTER_AUTH_URL`, the secret scan runs on live runners.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Activate production mode in the container — requirements: in `Dockerfile.server` run stage add `ENV NODE_ENV=production` alongside `ENV DATABASE_URL=/data/sqlite.db`; commands: edit `Dockerfile.server`
- [x] 2. Make `getDatabasePath()` create the database parent directory — requirements: call `mkdirSync(dirname(path), { recursive: true })` (import `mkdirSync` from `node:fs`) before returning from `getDatabasePath()` in `packages/db/src/db-path.ts`; covers app boot, `mikro-orm.config.ts`, `pnpm db:migrate`, tests, e2e; commands: edit `packages/db/src/db-path.ts`
- [x] 3. Extend the production boot guard — requirements: in `apps/server/src/index.ts` also exit non-zero when `NODE_ENV === "production"` and `ENV.BETTER_AUTH_URL` is unset or starts with `http://localhost`; message literal: `BETTER_AUTH_URL is unset or still points at localhost; refusing to start in production.`; commands: edit `apps/server/src/index.ts`
- [x] 4. Revive the secret scan — requirements: `.github/workflows/ci.yml` secret-scan job: `gitleaks/gitleaks-action@v2` → `gitleaks/gitleaks-action@v3`; its checkout step gains `with: fetch-depth: 0`; do not churn the other `actions/checkout@v5` steps; commands: edit `.github/workflows/ci.yml`
- [x] 5. Document the fail-fast Docker behavior — requirements: `README.md` Docker section: replace "if unset, the container boots on the schema defaults" with the new fail-fast behavior (production boot refuses missing `AUTH_SECRET` / localhost `BETTER_AUTH_URL`); commands: edit `README.md`

## 2. No-go

- Do not change the `actions/checkout@v5` versions elsewhere in CI (v5 runs on node24; only gitleaks v2 is dead).
- Do not alter the boot-guard message literal for `AUTH_SECRET`.
- No release/publish workflow additions.

## 3. Testing criteria

*All boxes checked = spec done.*

- [x] Fresh-clone sim: `mv data /tmp/sb-data.bak && pnpm db:migrate && test -f data/sqlite.db` → exit 0; restore with `rm -rf data && mv /tmp/sb-data.bak data`.
- [x] `NODE_ENV=production AUTH_SECRET=local-dev-placeholder-not-for-prod bun apps/server/src/index.ts` → exit 1 with the AUTH_SECRET placeholder message (unchanged).
- [x] `NODE_ENV=production AUTH_SECRET=$(openssl rand -base64 32) BETTER_AUTH_URL=http://localhost:3000 bun apps/server/src/index.ts` → exit 1 with the BETTER_AUTH_URL message.
- [x] With `BETTER_AUTH_URL` set to a non-localhost URL the server boots.
- [x] `docker compose build server && docker compose run --rm --no-deps --entrypoint env server | grep NODE_ENV=production` succeeds.
- [x] `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'` prints `ok`.
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
