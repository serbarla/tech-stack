# Spec 01 — Phase A: Nx in, Turborepo + Next.js + TanStack out

- Source: `NX_ELYSIA_SOLID_MIGRATION_PLAN.md` → `### Phase A`.
- Depends on: nothing (first spec).
- Repo root: `create-t3-turbo/` (the pnpm workspace root, its own git repo). Every path and command below is relative to it.
- Result carried forward: Nx is the only orchestrator; `apps/nextjs`, `apps/tanstack-start` and Turborepo are gone; the workspace installs and lints clean.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Delete retired apps and Turborepo plumbing — requirements: remove `apps/nextjs/`, `apps/tanstack-start/`, `turbo/`, `turbo.json`, `apps/expo/turbo.json`, `tooling/eslint/nextjs.ts`, `tooling/tailwind/postcss-config.js`; commands: `rm -rf apps/nextjs apps/tanstack-start turbo turbo.json apps/expo/turbo.json tooling/eslint/nextjs.ts tooling/tailwind/postcss-config.js`

- [x] 2. Repoint the root manifest at Nx — requirements: `devDependencies` drop `@turbo/gen` and `turbo`, add `nx@^23.3.0`; `scripts` become exactly:
  ```json
  "build": "nx run-many -t build",
  "clean": "nx run-many -t clean",
  "dev": "nx run-many -t dev --parallel",
  "format": "nx run-many -t format --parallel",
  "lint": "nx run-many -t lint --parallel",
  "typecheck": "nx run-many -t typecheck",
  "db:migrate": "nx run @acme/db:migration:up",
  "db:migration:create": "nx run @acme/db:migration:create",
  "lint:ws": "pnpm dlx sherif@latest",
  "postinstall": "pnpm lint:ws"
  ```
  Remove `dev:next`, `ui-add`, `android`, `ios`, `auth:generate`, `db:push`, `db:studio`, `lint:fix`, `format:fix`, and `clean:workspaces` (superseded by `clean`; turbo-only). Keep `engines`, `packageManager`, `@acme/prettier-config`, `dotenv-cli`, `prettier`, `typescript`; commands: `pnpm install`

- [x] 3. Add `nx.json` at the repo root — requirements: infer every `package.json` script as a target; reproduce Turborepo topological ordering via `dependsOn`; no `project.json` files anywhere:
  ```json
  {
    "plugins": ["nx/plugins/package-json"],
    "targetDefaults": {
      "build":    { "dependsOn": ["^build"], "cache": true, "inputs": ["default", "^default"], "outputs": ["{projectRoot}/dist", "{projectRoot}/.cache/tsbuildinfo.json"] },
      "lint":     { "dependsOn": ["^build"], "cache": true, "outputs": ["{projectRoot}/.cache/.eslintcache"] },
      "typecheck":{ "dependsOn": ["^build"], "cache": true, "outputs": ["{projectRoot}/.cache/tsbuildinfo.json"] },
      "format":   { "cache": true, "outputs": ["{projectRoot}/.cache/.prettiercache"] },
      "check":    { "dependsOn": ["^build"], "cache": true },
      "test":     { "cache": true },
      "dev":      { "cache": false },
      "clean":    { "cache": false },
      "migration:create": { "cache": false },
      "migration:up":     { "cache": false }
    },
    "defaultBase": "main"
  }
  ```
  commands: `pnpm nx show projects`

- [x] 4. Remove the turbo rule from the shared ESLint config — requirements: in `tooling/eslint/base.ts` drop the `turboPlugin` import, the `turbo: turboPlugin` plugin entry, and `...turboPlugin.configs.recommended.rules`; leave every other rule untouched; commands: none

- [x] 5. Prune `@acme/eslint-config` — requirements: `exports` drops `./nextjs`; `dependencies` drop `@next/eslint-plugin-next`, `eslint-plugin-turbo`, `eslint-plugin-jsx-a11y`; keep `./base` and `./react`; commands: `pnpm install`

- [x] 6. Rework the workspace catalog in `pnpm-workspace.yaml` — requirements:
  - remove now-unreferenced entries: `@tanstack/react-form`, `@vitejs/plugin-react`, `vite` (and the `vite: 7.1.12` entry in `overrides`), `@tailwindcss/postcss`;
  - change `better-auth` and `@better-auth/expo` to `^1.7.11` (keep the two version-aligned);
  - add `elysia: ^1.2.0`, `@elysiajs/cors: ^1.2.0`, `@elysiajs/eden: ^1.2.0`, `@mikro-orm/core: ^7.2.5`, `@mikro-orm/sql: ^7.2.5`, `@mikro-orm/migrations: ^7.2.5`, `kysely: ^0.28.0`, `@types/bun: ^1.2.0`, `solid-js: ^2.0.0-rc`, `vite-plus: ^1.0.0`, `vitest: ^3.0.0`;
  - keep `@eslint/js`, `@tailwindcss/vite`, `@tanstack/react-query`, `@types/node`, `eslint`, `prettier`, `tailwindcss`, `typescript`, `zod` (zod floor raised to `^4.5.4` — see divergences);
  - keep `@trpc/client`, `@trpc/server`, `@trpc/tanstack-react-query` and `@better-auth/cli` in the catalog for now — their consumers still pin `catalog:` (`apps/expo`, `packages/api`, `packages/auth`) and `pnpm install` fails if an entry is dropped early; they are removed in specs 03/04/06;
  - do NOT add the Solid-2-coordinated packages (`@solidjs/vite-plugin`, `@solidjs/meta`, `@solidjs/testing-library`, `filesystem-routing`) — they stay app-level in `apps/web`, RC-coupled;
  - commands: `pnpm install`

- [x] 7. Drop the dead PostCSS wiring from `@acme/tailwind-config` — requirements: `tooling/tailwind/package.json` removes the `./postcss-config` export, the `@tailwindcss/postcss` and `postcss` dependencies (only the deleted file used them), and the `lint` script (no lintable file remains — ESLint hard-errors on an all-ignored glob); keep `format`/`typecheck`/`clean`; commands: `pnpm install`

- [x] 8. Extend `.gitignore` — requirements: add `.nx`, `.vp`, `data/`, `*.sqlite`, `*.sqlite-journal`, `*.sqlite-wal`, `*.sqlite-shm`; commands: none

- [x] 9. Prove Nx owns the graph and the workspace is still green — requirements: install, list projects, render the graph, then run the full t3 rule set; commands:
  ```
  pnpm install
  pnpm nx show projects
  pnpm nx graph --file=.nx/graph.html
  pnpm typecheck
  pnpm lint
  pnpm format
  pnpm lint:ws
  ```

## 2. No-go

- No edits to `packages/db/src`, `packages/db/package.json`, `packages/auth/src`, `packages/auth/package.json`, `packages/api/src`, `packages/api/package.json`, `apps/expo/src`, `apps/expo/package.json` (specs 02–06).
- Do not touch `packages/ui` — expo keeps React/shadcn unchanged.
- Do not create `project.json` files; the package-json plugin infers targets from scripts.
- Do not remove `@trpc/*` or `@better-auth/cli` catalog entries in this phase (see objective 6).
- Do not hand-pin `solid-js` 2 RC-adjacent packages in the catalog.
- Do not add unit tests, test runners, or CI changes (spec 08).
- Do not run `pnpm dev` — no server exists until spec 05.
- Do not delete `packages/db/src/client.ts`, drizzle files, or model anything; that is spec 02.

## 3. Testing criteria

- [x] `pnpm install` exits 0 with no unresolved `catalog:` entries (`pnpm-lock.yaml` regenerated without `turbo`, `@turbo/gen`); `pnpm install --frozen-lockfile` also exits 0.
- [x] `pnpm nx show projects` lists `@acme/api`, `@acme/auth`, `@acme/db`, `@acme/expo`, `@acme/ui`, `@acme/validators`, `@acme/eslint-config`, `@acme/prettier-config`, `@acme/tailwind-config`, `@acme/tsconfig`, `@acme/github` — and no `@acme/nextjs` / `@acme/tanstack-start`.
- [x] `pnpm nx graph --file=.nx/graph.html` exits 0; the emitted HTML is a shell, so edges are verified from `.nx/workspace-data/project-graph.json`: `@acme/expo → @acme/api` and `@acme/api → @acme/auth|@acme/db|@acme/validators`.
- [x] `pnpm typecheck` exits 0 (12/12 tasks).
- [x] `pnpm lint` exits 0 (no `turbo` plugin errors; 9/9 tasks).
- [x] `pnpm format` exits 0 (9/9 tasks).
- [x] `pnpm lint:ws` exits 0 (`✓ No issues found`).
- [x] `grep -rnE '"turbo"|@turbo/gen|turbo run' package.json nx.json pnpm-workspace.yaml tooling` prints nothing.
- [x] `ls apps` prints only `expo`; `turbo.json`, `apps/expo/turbo.json`, `tooling/eslint/nextjs.ts`, `tooling/tailwind/postcss-config.js` do not exist.
- [x] every objective in section 1 is checked (divergences appended below).

### Divergences

- **zod floor raised to `^4.5.4`** (spec said "keep zod"). `better-auth@1.7.12` pins `zod: ^4.5.4`, so pnpm installed a second copy (`zod@4.6.7`) alongside the workspace `4.1.12`; `@acme/api` then failed declaration emit with `TS2742 … cannot be named without a reference to .pnpm/zod@4.6.7/…/zod/v4/core` in `trpc.ts`/`root.ts`. Aligning the catalog dedupes zod to one version and `pnpm typecheck` passes. No `packages/api/src` edit was needed.
- **`apps/expo/src/utils/api.tsx`: `getCookie()` is now async.** `@better-auth/expo@1.7.12` types `getCookie: () => Promise<string>` (was sync in 1.4 beta), so the tRPC `httpBatchLink` headers callback failed `TS2345`. Minimal repair: `async headers()` + `await authClient.getCookie()`. No Phase F objective implemented; the file is fully replaced in spec 06.
- **`@acme/tailwind-config` lost its lint target.** Deleting `postcss-config.js` left zero lintable files (`theme*.css` only, config file ignored), and ESLint 9 errors with "all of the files matching the glob pattern '.' are ignored". Removed the `lint` script; also dropped the now-unused `postcss` dependency.
- **`nx graph --file` output is a JS shell** (`.nx/graph.html` + `.nx/static/*`), not inline graph data; edge verification moved to `.nx/workspace-data/project-graph.json`.
- **`turbo` grep false positives:** the repo is literally named `create-t3-turbo`, and each package's `clean` script still contains `.turbo` in its `git clean` path (untouched by this spec). The refined grep above targets the orchestrator only.
- **Frozen install:** the first `pnpm install` failed `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` because the `overrides` block lost `vite`; regenerated once with `--no-frozen-lockfile`, after which `--frozen-lockfile` exits 0.
- **Nx build scripts:** pnpm ignored the `nx` postinstall (native binding, alongside pre-existing `prisma`/`better-sqlite3`/`sharp` ignores); the Nx CLI, project graph, caching and all targets work regardless.
