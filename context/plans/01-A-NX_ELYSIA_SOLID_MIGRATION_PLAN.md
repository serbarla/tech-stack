# Nx + Elysia/Eden + Solid 2 monorepo migration

## Context

Transform the `sb-stack-v1` monorepo (`@acme/*`, pnpm 10 workspace + catalog, Turborepo) into an Nx polyglot monorepo with: (1) Turborepo removed in favor of Nx; (2) `apps/nextjs` and `apps/tanstack-start` deleted; (3) a new Solid 2.0 (RC) web app built with Vite+ (`vp`) and Bun; (4) a new Elysia (Bun) server app; (5) tRPC removed everywhere in favor of Elysia Eden Treaty shared types; (6) Expo kept and migrated from tRPC to Eden; (7) **Drizzle removed; MikroORM (entities/migrations/unit-of-work) + Kysely (type-safe raw SQL via MikroORM's first-class `em.getKysely()`) on SQLite**; (8) better-auth kept (Discord OAuth + Expo plugin) on SQLite; (9) zod kept; (10) everything containerized with Docker. Rule enforcement: **web app uses Vite+ `vp check` (Oxlint/Oxfmt/tsgo); server/expo/packages keep the t3 ESLint/Prettier/tsc + sherif set**.

DB driver: **`node:sqlite` (`DatabaseSync`)** — Bun-native (Bun ships `node:sqlite`), no native addons, and gives first-party drivers everywhere: MikroORM `@mikro-orm/sql` `NodeSqliteDialect` (built-in), better-auth's built-in `node:sqlite` adapter. Kysely enters via MikroORM's first-class `em.getKysely()` (full Kysely API, typed from the entity).

Final shape:
```
apps/web        @acme/web      Solid 2 RC + Vite+ (vp) + Bun   (new)
apps/server     @acme/server   Elysia + Bun                     (new)
apps/expo       @acme/expo     Expo/RN, tRPC→Eden               (kept)
packages/api    @acme/api      tRPC router → Elysia app + App type
packages/auth   @acme/auth     better-auth, node:sqlite adapter
packages/db     @acme/db       MikroORM + Kysely (node:sqlite), Post entity
packages/validators  @acme/validators  zod (now holds CreatePostSchema)
packages/ui     @acme/ui       React/shadcn (expo only, unchanged)
tooling/{eslint,prettier,typescript,tailwind,github}
nx.json, docker-compose.yml, Dockerfile.web, Dockerfile.server
```

Ports: server `3000`, web `3001`, expo metro `8081`. SQLite file path via `DATABASE_URL` env.

## Approach (ordered; build/typecheck green after each phase)

### Phase A — Nx in, Turborepo + Next.js + TanStack out

1. Delete directories/files: `apps/nextjs/`, `apps/tanstack-start/`, `turbo/`, `turbo.json`, `apps/expo/turbo.json`, `tooling/eslint/nextjs.ts`, `tooling/tailwind/postcss-config.js` (only Next.js used it).
2. Root `package.json`:
   - `devDependencies`: remove `@turbo/gen`, `turbo`; add `nx@^23.3.0`.
   - Rewrite `scripts`:
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
     Remove `dev:next`, `ui-add`, `android`, `ios`, `auth:generate`, `db:push`, `db:studio`, `lint:fix`, `format:fix` (turbo/drizzle-only; expo keeps its own `android`/`ios`; per-project `--fix`/`--write` remain via editor or `eslint --fix`/`prettier --write`; web auto-fix via `vp check --fix`).
3. Create `nx.json` (root):
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
   `nx/plugins/package-json` infers every `package.json` `script` as a target (existing `lint`/`typecheck`/`format`/`dev`/`clean` scripts become Nx targets). No `project.json` files needed.
4. `tooling/eslint/base.ts`: remove the `turboPlugin` import, the `turbo: turboPlugin` plugin entry, and `...turboPlugin.configs.recommended.rules`.
5. `tooling/eslint/package.json`: remove `./nextjs` from `exports`; remove deps `@next/eslint-plugin-next`, `eslint-plugin-turbo`, `eslint-plugin-jsx-a11y` (unused).
6. `pnpm-workspace.yaml` catalog — apply the full set of edits:
   - Remove: `@trpc/client`, `@trpc/server`, `@trpc/tanstack-react-query`, `@tanstack/react-form`, `@vitejs/plugin-react`, `vite` (and the `vite: 7.1.12` entry in `overrides`), `@tailwindcss/postcss`, `@better-auth/cli`.
   - Change: `better-auth` and `@better-auth/expo` to `^1.7.11` (keep the two version-aligned).
   - Add: `elysia` (`^1.2.0`), `@elysiajs/cors` (`^1.2.0`), `@elysiajs/eden` (`^1.2.0`), `@mikro-orm/core` (`^7.2.5`), `@mikro-orm/sql` (`^7.2.5`), `@mikro-orm/migrations` (`^7.2.5`), `kysely` (`^0.28.0`), `@types/bun` (`^1.2.0`), `solid-js` (`^2.0.0-rc`), `vite-plus` (`^1.0.0`), `vitest` (`^3.0.0`).
   - Keep: `@eslint/js`, `@tailwindcss/vite`, `@tanstack/react-query`, `@types/node`, `eslint`, `prettier`, `tailwindcss`, `typescript`, `zod`.
   - Resolve exact latest patch at `pnpm install` (versions above are floors); keep the Solid-2-coordinated packages (`@solidjs/vite-plugin`, `@solidjs/meta`, `@solidjs/testing-library`, `filesystem-routing`) OUT of the catalog (app-level, RC-coupled).
7. `.gitignore`: add `.nx`, `.vp`, `data/`, `*.sqlite`, `*.sqlite-journal`, `*.sqlite-wal`, `*.sqlite-shm`.

### Phase B — Database: Drizzle → MikroORM + Kysely (`node:sqlite`)

1. Delete `packages/db/drizzle.config.ts`, `packages/db/src/schema.ts`, `packages/db/src/auth-schema.ts`.
2. `packages/db/package.json`:
   - `dependencies`: remove `@vercel/postgres`, `drizzle-orm`, `drizzle-zod`, `zod`; add `@mikro-orm/core: catalog:`, `@mikro-orm/sql: catalog:`, `kysely: catalog:`.
   - `devDependencies`: remove `drizzle-kit`; add `@mikro-orm/migrations: catalog:`.
   - `scripts`: remove `push`, `studio`, `with-env`; add:
     ```json
     "migration:create": "mikro-orm migration:create",
     "migration:up": "mikro-orm migration:up"
     ```
     Keep `build`, `clean`, `dev`, `format`, `lint`, `typecheck`.
3. `packages/db/src/entities/post.ts` — MikroORM entity via `defineEntity` (no decorators; exact property/hook shape re-read from `@mikro-orm/core` 7.2 `defineEntity` docs before writing):
   ```ts
   import { defineEntity } from "@mikro-orm/core";

   export const Post = defineEntity({
     name: "Post",
     tableName: "post",
     properties: {
       id: { type: "uuid", primary: true },
       title: { type: "string", length: 256 },
       content: { type: "text" },
       createdAt: { type: "datetime", onCreate: () => new Date() },
       updatedAt: { type: "datetime", onCreate: () => new Date(), onUpdate: () => new Date() },
     },
   });
   ```
4. `packages/db/src/index.ts`:
   ```ts
   import { MikroORM, NodeSqliteDialect, SqliteDriver } from "@mikro-orm/sql";
   import { Post } from "./entities/post";

   let orm: MikroORM | undefined;

   export async function initDb(): Promise<MikroORM> {
     const path = process.env.DATABASE_URL ?? "./sqlite.db";
     orm = await MikroORM.init({
       driver: SqliteDriver,
       driverOptions: new NodeSqliteDialect(path),
       entities: [Post],
       dbName: path,
     });
     return orm;
   }

   export function getOrm(): MikroORM {
     if (!orm) throw new Error("DB not initialized — call initDb() first");
     return orm;
   }

   export { Post };
   ```
5. `packages/db/mikro-orm.config.ts` — CLI config for migrations (reuses the same options):
   ```ts
   import { defineConfig, NodeSqliteDialect, SqliteDriver } from "@mikro-orm/sql";
   import { Post } from "./src/entities/post";

   export default defineConfig({
     driver: SqliteDriver,
     driverOptions: () => new NodeSqliteDialect(process.env.DATABASE_URL ?? "./sqlite.db"),
     entities: [Post],
     dbName: process.env.DATABASE_URL ?? "./sqlite.db",
     migrations: { path: "./src/migrations", pathTs: "./src/migrations" },
   });
   ```
   (`driverOptions` is a factory here because `mikro-orm.config.ts` is loaded by the CLI before env is guaranteed; confirm exact `defineConfig` signature from `@mikro-orm/sql` 7.2 docs.)
6. `packages/db/package.json` exports: keep the `types: ./dist/index.d.ts` / `default: ./src/index.ts` pattern; add `"./mikro-orm.config"` export if the CLI needs it, otherwise keep single `.` export.
7. Create the initial migration: `pnpm db:migration:create` → rename to `Migration...` with `await this.addSql('create table "post" (...);')` producing columns `id text pk`, `title text not null`, `content text not null`, `created_at datetime`, `updated_at datetime` (snake_case). Empty/missing `DATABASE_URL` → default `./sqlite.db` (Phase B step 4/5 already default it, so no throw).
8. `packages/db/src/index.ts` also exposes Kysely: add
   ```ts
   export function getKysely() { return getOrm().em.getKysely(); }
   ```
   (MikroORM's first-class Kysely integration; type-safe raw SQL over the same connection/transaction.)

### Phase C — Auth: better-auth on `node:sqlite`

1. Delete `packages/auth/script/auth-cli.ts` and the `script/` dir (drizzle schema generation no longer needed).
2. `packages/auth/package.json`: remove `@better-auth/cli` devDep and the `generate` script; bump `better-auth` + `@better-auth/expo` to `catalog:` (both `^1.7.11`). Keep `@t3-oss/env-core`, `zod`.
3. `packages/auth/src/index.ts`: replace the drizzle adapter with better-auth's built-in `node:sqlite` adapter:
   ```ts
   import { DatabaseSync } from "node:sqlite";
   import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
   import { expo } from "@better-auth/expo";
   import { betterAuth } from "better-auth";
   import { oAuthProxy } from "better-auth/plugins";

   export function initAuth<TExtraPlugins extends BetterAuthPlugin[] = []>(options: {
     baseUrl: string; productionUrl: string; secret: string | undefined;
     discordClientId: string; discordClientSecret: string; extraPlugins?: TExtraPlugins;
   }) {
     const config = {
       database: new DatabaseSync(process.env.DATABASE_URL ?? "./sqlite.db"),
       baseURL: options.baseUrl,
       secret: options.secret,
       plugins: [ oAuthProxy({ productionURL: options.productionUrl }), expo(), ...(options.extraPlugins ?? []) ],
       socialProviders: {
         discord: {
           clientId: options.discordClientId,
           clientSecret: options.discordClientSecret,
           redirectURI: `${options.productionUrl}/api/auth/callback/discord`,
         },
       },
       trustedOrigins: ["expo://", "http://localhost:3001"],
       onAPIError: { onError(error, ctx) { console.error("BETTER AUTH API ERROR", error, ctx); } },
     } satisfies BetterAuthOptions;
     return betterAuth(config);
   }
   export type Auth = ReturnType<typeof initAuth>;
   export type Session = Auth["$Infer"]["Session"];
   ```
   better-auth's `node:sqlite` adapter auto-creates/updates its `user`/`session`/`account`/`verification` tables on init; no generated schema file. Auth tables and MikroORM's `post` table share the same `DATABASE_URL` file (separate connections — enable SQLite WAL via a one-line `PRAGMA journal_mode=WAL` on init in `initDb` to allow concurrent readers/writers).
4. `packages/auth/env.ts`: unchanged (`AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `NODE_ENV`).

### Phase D — API: tRPC → Elysia + Eden Treaty

1. `packages/api/package.json`: remove deps `@trpc/server`, `superjson`; add `elysia: catalog:`, `@elysiajs/cors: catalog:`. Keep `@acme/auth`, `@acme/db`, `@acme/validators`, `zod`. Keep `exports` (`types: ./dist/index.d.ts`, `default: ./src/index.ts`) and `build: tsc`.
2. Delete `packages/api/src/trpc.ts`, `packages/api/src/root.ts`, `packages/api/src/router/post.ts`, `packages/api/src/router/auth.ts`.
3. Create `packages/api/src/middleware.ts`:
   ```ts
   import { Elysia } from "elysia";
   import type { Auth } from "@acme/auth";

   export const authed = (auth: Auth) =>
     new Elysia({ name: "auth" }).macro({
       auth: {
         async resolve({ status, request: { headers } }) {
           const session = await auth.api.getSession({ headers });
           if (!session) return status(401);
           return { user: session.user, session: session.session };
         },
       },
     });
   ```
4. Create `packages/api/src/router/post.ts` (MikroORM `em` for CRUD; `getKysely()` for the list to exercise Kysely):
   ```ts
   import { Elysia } from "elysia";
   import type { MikroORM } from "@mikro-orm/sql";
   import type { Auth } from "@acme/auth";
   import { Post } from "@acme/db";
   import { CreatePostSchema } from "@acme/validators";
   import { authed } from "../middleware";

   export const postRoutes = (auth: Auth, orm: MikroORM) =>
     new Elysia()
       .use(authed(auth))
       .get("/api/posts", async () => {
         const kysely = orm.em.getKysely();
         return kysely.selectFrom("post").selectAll().orderBy("created_at", "desc").limit(10).execute();
       })
       .get("/api/posts/:id", ({ params: { id } }) => orm.em.findOne(Post, { id }))
       .post("/api/posts", async ({ body }) => {
         const post = orm.em.create(Post, body);
         await orm.em.flush();
         return post;
       }, { body: CreatePostSchema, auth: true })
       .delete("/api/posts/:id", async ({ params: { id } }) => {
         const post = await orm.em.findOne(Post, { id });
         if (post) await orm.em.removeAndFlush(post);
         return post;
       }, { auth: true });
   ```
5. Create `packages/api/src/index.ts`:
   ```ts
   import { Elysia } from "elysia";
   import { cors } from "@elysiajs/cors";
   import type { MikroORM } from "@mikro-orm/sql";
   import type { Auth } from "@acme/auth";
   import { postRoutes } from "./router/post";
   import { authed } from "./middleware";

   export function createApp(options: { auth: Auth; orm: MikroORM }) {
     const { auth, orm } = options;
     return new Elysia()
       .use(cors({ origin: ["http://localhost:3001"], methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], credentials: true, allowedHeaders: ["Content-Type", "Authorization"] }))
       .mount(auth.handler)
       .use(authed(auth))
       .get("/api/protected", ({ user }) => ({ message: "you can see this secret message!" }), { auth: true })
       .use(postRoutes(auth, orm));
   }
   export type App = ReturnType<typeof createApp>;
   ```
   Endpoints: `GET /api/posts`, `GET /api/posts/:id`, `POST /api/posts` (protected), `DELETE /api/posts/:id` (protected), `GET /api/protected` (protected), better-auth at `/api/auth/*`. Session is fetched client-side via better-auth client (no server route; avoids colliding with `/api/auth/*`).

### Phase E — New apps: `apps/server` (Elysia/Bun) and `apps/web` (Solid 2/Vite+/Bun)

**`apps/server`**:
1. `apps/server/package.json` (`@acme/server`, `"type": "module"`):
   ```json
   "scripts": {
     "dev": "bun --watch src/index.ts",
     "start": "bun src/index.ts",
     "clean": "git clean -xdf .cache node_modules",
     "format": "prettier --check . --ignore-path ../../.gitignore",
     "lint": "eslint --flag unstable_native_nodejs_ts_config",
     "typecheck": "tsc --noEmit"
   },
   "dependencies": {
     "@acme/api": "workspace:*",
     "@acme/auth": "workspace:*",
     "@acme/db": "workspace:*",
     "@t3-oss/env-core": "^0.13.8",
     "elysia": "catalog:",
     "zod": "catalog:"
   },
   "devDependencies": {
     "@acme/eslint-config": "workspace:*",
     "@acme/prettier-config": "workspace:*",
     "@acme/tsconfig": "workspace:*",
     "@types/bun": "catalog:",
     "@types/node": "catalog:",
     "eslint": "catalog:",
     "prettier": "catalog:",
     "typescript": "catalog:"
   },
   "prettier": "@acme/prettier-config"
   ```
2. `apps/server/src/env.ts`: t3-env validating `NODE_ENV`, `PORT` (default `3000`), `BETTER_AUTH_URL` (default `http://localhost:3000`), `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `DATABASE_URL` (default `./sqlite.db`).
3. `apps/server/src/index.ts`:
   ```ts
   import { createApp } from "@acme/api";
   import { initAuth } from "@acme/auth";
   import { initDb } from "@acme/db";
   import { env } from "./env";

   const orm = await initDb();
   const auth = initAuth({
     baseUrl: env.BETTER_AUTH_URL,
     productionUrl: env.BETTER_AUTH_URL,
     secret: env.AUTH_SECRET,
     discordClientId: env.AUTH_DISCORD_ID,
     discordClientSecret: env.AUTH_DISCORD_SECRET,
   });

   createApp({ auth, orm }).listen(env.PORT, () => {
     console.log(`🦊 Elysia running at http://localhost:${env.PORT}`);
   });
   ```
   (Top-level `await` works because Bun runs ESM natively.)
4. `apps/server/eslint.config.ts`: `baseConfig` + `restrictEnvAccess` from `@acme/eslint-config/base`.
5. `apps/server/tsconfig.json`: extends `@acme/tsconfig/base.json`, `"types": ["bun", "node"]` (node for `node:sqlite` typing, bun for Bun runtime).

**`apps/web`** (scaffold with `bun create solid@latest`, choose **basic** shape, in a temp dir, then copy into `apps/web/` and convert to a workspace package):
1. Keep from the scaffold: `src/App.tsx`, `src/Document.tsx`, `src/router.ts`, `src/routes/index.tsx` (replace content with the demo), `vite.config.ts`, `src/routes/[...404].tsx`, `src/components/`.
2. `apps/web/package.json` (`@acme/web`, `"type": "module"`):
   ```json
   "scripts": {
     "dev": "vp dev",
     "build": "vp build",
     "check": "vp check",
     "test": "vp test",
     "clean": "git clean -xdf .cache node_modules dist"
   },
   "dependencies": {
     "@acme/api": "workspace:*",
     "@acme/tailwind-config": "workspace:*",
     "@elysiajs/eden": "catalog:",
     "better-auth": "catalog:",
     "solid-js": "catalog:"
   },
   "devDependencies": {
     "@acme/tsconfig": "workspace:*",
     "@tailwindcss/vite": "catalog:",
     "@types/bun": "catalog:",
     "tailwindcss": "catalog:",
     "vite-plus": "catalog:",
     "vitest": "catalog:"
   }
   ```
   Keep the Solid-2-coordinated devDeps copied verbatim from the scaffold's package.json: `@solidjs/vite-plugin`, `@solidjs/meta`, `@solidjs/testing-library`, `filesystem-routing` (RC-coupled; do not hand-pin).
3. `apps/web/vite.config.ts` — scaffold config + Tailwind + port 3001:
   ```ts
   import tailwindcss from "@tailwindcss/vite";
   import { fileRoutes } from "filesystem-routing/vite";
   import { defineConfig } from "vitest/config";
   import solid from "@solidjs/vite-plugin";

   export default defineConfig({
     server: { port: 3001 },
     plugins: [ solid({ start: true, extensions: [".jsx", ".tsx"], diagnostics: true }), fileRoutes({ types: true }), tailwindcss() ],
   });
   ```
4. `apps/web/tsconfig.json`: extends `@acme/tsconfig/base.json`, add `"jsx": "preserve"`, `"jsxImportSource": "solid-js"`, `"types": ["bun"]`, `"lib": ["ES2022", "DOM", "DOM.Iterable"]`.
5. `apps/web/src/lib/api.ts`:
   ```ts
   import { treaty } from "@elysiajs/eden";
   import type { App } from "@acme/api";
   const getBaseUrl = () => import.meta.env.VITE_API_URL ?? "http://localhost:3000";
   export const api = treaty<App>(getBaseUrl(), { fetch: { credentials: "include" } });
   ```
6. `apps/web/src/lib/auth.ts`:
   ```ts
   import { createAuthClient } from "better-auth/client";
   export const authClient = createAuthClient({ baseURL: getBaseUrl() });
   ```
   Use Solid `createResource` for the session (framework-agnostic client; no `better-auth/solid` dependency).
7. `apps/web/src/routes/index.tsx` — demo page: `AuthShowcase` (sign in via `authClient.signIn.social({ provider: "discord", callbackURL: "/" })`; signed-in state from `createResource(() => authClient.getSession())`; sign out via `authClient.signOut()`), `CreatePostForm` (`api.post.index.post(...)`), `PostList` (`api.post.index.get()`). Eden response `.data` carries the typed body. Import `@acme/tailwind-config/theme` in the app CSS for shared theme tokens.
8. Root `.env.example` gains `VITE_API_URL="http://localhost:3000"`.

### Phase F — Expo: tRPC → Eden Treaty

1. `apps/expo/package.json`: remove deps `@trpc/client`, `@trpc/server`, `@trpc/tanstack-react-query`, `superjson`; add `@elysiajs/eden: catalog:`. Keep `@tanstack/react-query`, `better-auth`, `@better-auth/expo`, and `@acme/api` (now types-only).
2. `apps/expo/src/utils/api.tsx`: delete the tRPC setup; replace with:
   ```ts
   import { treaty } from "@elysiajs/eden";
   import type { App } from "@acme/api";
   import { getBaseUrl } from "./base-url";
   export const api = treaty<App>(getBaseUrl(), { fetch: { credentials: "include" } });
   export const queryClient = new QueryClient({ ... });
   ```
   Remove `superjson`/`loggerLink`/`httpBatchLink` imports and `export type { RouterInputs, RouterOutputs }`.
3. `apps/expo/src/utils/auth.ts`: unchanged (better-auth client + `expoClient`; baseURL already `getBaseUrl()`).
4. `apps/expo/src/app/index.tsx` and `src/app/post/[id].tsx`: replace tRPC query/mutation options with `useQuery`/`useMutation` over `api`:
   - list: `useQuery({ queryKey: ["posts"], queryFn: () => api.post.index.get().then(r => r.data) })`
   - byId: `useQuery({ queryKey: ["post", id], queryFn: () => api.post({ id }).get().then(r => r.data) })`
   - create: `useMutation({ mutationFn: (input) => api.post.index.post(input).then(r => r.data) })`
   - delete: `useMutation({ mutationFn: (id) => api.post({ id }).delete().then(r => r.data) })`
   Replace the `RouterOutputs` import (was `~/utils/api`) with a local `NonNullable<Awaited<ReturnType<...>>>` or drop it. Keep `authClient` usage unchanged.

### Phase G — Docker

1. `.dockerignore`: `node_modules`, `.git`, `dist`, `.cache`, `.turbo`, `.nx`, `.vp`, `.env*`, `data`, `*.sqlite*`, `apps/*/dist`.
2. `Dockerfile.server` (multi-stage; pnpm install on Node, run on Bun):
   ```dockerfile
   FROM node:22 AS deps
   RUN corepack enable
   WORKDIR /app
   COPY package.json pnpm-workspace.yaml pnpm-lock.yaml nx.json ./
   COPY apps apps packages packages tooling tooling
   RUN pnpm install --frozen-lockfile

   FROM oven/bun:1 AS run
   WORKDIR /app
   COPY --from=deps /app/node_modules ./node_modules
   COPY --from=deps /app ./
   ENV DATABASE_URL=/data/sqlite.db
   EXPOSE 3000
   CMD ["bun", "apps/server/src/index.ts"]
   ```
3. `Dockerfile.web` (build static with `vp`, serve with nginx):
   ```dockerfile
   FROM node:22 AS build
   RUN corepack enable
   WORKDIR /app
   COPY package.json pnpm-workspace.yaml pnpm-lock.yaml nx.json ./
   COPY apps apps packages packages tooling tooling
   RUN pnpm install --frozen-lockfile
   RUN pnpm nx run @acme/web:build

   FROM nginx:alpine AS run
   COPY --from=build /app/apps/web/dist/client /usr/share/nginx/html
   ```
   `vp build` outputs static files to `apps/web/dist/client` (Solid 2 basic shape; confirm the exact output dir and adjust the `COPY` source if it emits to `dist/` instead).
4. `docker-compose.yml`:
   ```yaml
   services:
     server:
       build: { context: ., dockerfile: Dockerfile.server }
       ports: ["3000:3000"]
       environment:
         DATABASE_URL: /data/sqlite.db
         BETTER_AUTH_URL: http://localhost:3000
         AUTH_SECRET: ${AUTH_SECRET}
         AUTH_DISCORD_ID: ${AUTH_DISCORD_ID}
         AUTH_DISCORD_SECRET: ${AUTH_DISCORD_SECRET}
       volumes: ["./data:/data"]
     web:
       build: { context: ., dockerfile: Dockerfile.web }
       ports: ["3001:80"]
       depends_on: [server]
   ```
   SQLite is a file DB — no DB container; state lives in the `./data` volume.

### Phase H — CI + env + tooling cleanup

1. `tooling/github/setup/action.yml`: remove `pnpm add -g turbo`; add `oven-sh/setup-bun@v2` before install (for `vp`/Bun apps); keep `pnpm/action-setup` + `actions/setup-node` + `pnpm install`.
2. `.github/workflows/ci.yml`: remove `TURBO_TEAM`/`TURBO_TOKEN` env (drop Vercel remote cache; optionally add `NX_CLOUD_ACCESS_TOKEN`). Rewrite jobs:
   - `lint`: `pnpm lint && pnpm lint:ws`
   - `format`: `pnpm format`
   - `typecheck`: `pnpm typecheck`
   - `check-web`: `pnpm nx run @acme/web:check`
   Keep `cp .env.example .env` before each.
3. `.env.example`: replace `POSTGRES_URL=...` with:
   ```
   # SQLite file path (node:sqlite). Local: ./sqlite.db ; Docker (server): /data/sqlite.db
   DATABASE_URL="./sqlite.db"
   # Public URL of the Elysia server (better-auth base URL)
   BETTER_AUTH_URL="http://localhost:3000"
   ```
   Keep `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`; add `VITE_API_URL="http://localhost:3000"`.

## Critical files & anchors

- `packages/db/src/index.ts` — `initDb()`/`getOrm()`/`getKysely()`; the `node:sqlite` `NodeSqliteDialect` wiring and `DATABASE_URL` contract.
- `packages/db/src/entities/post.ts` — MikroORM `defineEntity` `Post`; re-read the 7.2 `defineEntity` property/hook API before writing.
- `packages/auth/src/index.ts` — `database: new DatabaseSync(...)` node:sqlite adapter + `trustedOrigins`.
- `packages/api/src/index.ts` — `createApp({ auth, orm })` + `export type App`; single source of truth for Eden Treaty client types.
- `nx.json` — `nx/plugins/package-json` + `targetDefaults` `dependsOn: ["^build"]`; reproduces Turborepo's topological build/lint/typecheck.

## Verification (end-to-end; unit tests not required per repo policy)

Run from repo root after `pnpm install` (Node 22, pnpm 10, Bun 1.x, `vp` via the `vite-plus` devDependency).

1. **Workspace + graph**: `pnpm nx show projects` lists `@acme/web`, `@acme/server`, `@acme/expo`, `@acme/api`, `@acme/auth`, `@acme/db`, `@acme/validators`, `@acme/ui`, plus tooling. `pnpm nx graph` shows `web`→`api`→`db`/`auth`/`validators` and `server`→`api`→… edges.
2. **Typecheck**: `cp .env.example .env` then `pnpm typecheck` exits 0 (builds db/validators/api dist types first, then tsc for all TS projects).
3. **Lint/format (t3 rule set)**: `pnpm lint && pnpm format && pnpm lint:ws` exits 0 (server/expo/packages).
4. **Web check (Vite+)**: `pnpm nx run @acme/web:check` exits 0 (Oxlint/Oxfmt/tsgo).
5. **DB**: `pnpm db:migrate` creates `sqlite.db` with the `post` table (`sqlite3 sqlite.db '.schema post'` shows `id`/`title`/`content`/`created_at`/`updated_at`).
6. **Server smoke**: `pnpm nx run @acme/server:dev` → logs `🦊 Elysia running at http://localhost:3000`; `curl http://localhost:3000/api/posts` returns `[]`; `curl http://localhost:3000/api/auth/ok` returns better-auth 200; restarting the server does not error (auth tables auto-created).
7. **Web smoke**: `pnpm nx run @acme/web:dev` → open `http://localhost:3001`; page renders the post list; creating a post (after Discord sign-in) appears; sign out hides the form.
8. **End-to-end CRUD + auth**: sign in via Discord on web → `POST /api/posts` returns the row → `GET /api/posts` includes it → `DELETE /api/posts/:id` removes it → `GET /api/protected` returns the secret message only when authed (401 otherwise).
9. **Expo**: `cd apps/expo && pnpm dev` → list posts and sign in against the local server (`http://<host>:3000`).
10. **Docker**: `docker compose up --build` → `curl http://localhost:3000/api/posts` → `[]`; `curl http://localhost:3001` serves the Solid app HTML; `docker compose exec server ls /data/sqlite.db` exists; restarting containers persists posts (volume).

## Assumptions & contingencies

- **`node:sqlite` on Bun**: Bun ships `node:sqlite` `DatabaseSync` (Bun API reference). Smoke-test in Phase B/6. If MikroORM's `NodeSqliteDialect` misbehaves under Bun, fall back to `bun:sqlite` via MikroORM's generic `SqliteDriver` + a `bun:sqlite` Kysely dialect (`@zgeoff/kysely-bun-sqlite`) and better-auth's Kysely adapter (`kyselyAdapter(kysely, { type: "sqlite" })`).
- **MikroORM entity syntax**: exact `defineEntity` property/hook spelling (`onCreate`/`onUpdate`, `type: "uuid"/"text"/"datetime"`) is re-read from `@mikro-orm/core` 7.2 docs at implementation; the field names/types above are fixed.
- **better-auth schema**: the `node:sqlite` adapter auto-creates auth tables; if the installed version instead requires explicit migration, run `@better-auth/cli migrate` (re-add `@better-auth/cli` as a devDep only in that case).
- **Solid 2.0 is RC**: scaffold with `bun create solid@latest` (basic) so `solid-js`/`@solidjs/vite-plugin`/`filesystem-routing`/`@solidjs/meta`/`@solidjs/testing-library` stay on coordinated RC versions. Do not hand-pin these.
- **Vite+ config**: `vp` consumes the standard `vite.config.ts` (Vite 8/Rolldown). If `vp build`/`vp dev` reject the Solid plugins, fall back to plain `vite` + `@solidjs/vite-plugin` for the web toolchain (drop `vite-plus`), and the web `check` target becomes the repo-wide ESLint/Prettier/tsc set.
- **Eden credentials**: Eden Treaty 2 cross-origin cookies use `fetch: { credentials: "include" }`; if the installed `@elysiajs/eden` uses a different shape (e.g. top-level `credentials`), adapt to its documented v2 API.
- **`vp build` output dir**: Solid 2 "basic" emits to `dist/client`; if Vite+ emits to `dist/` instead, update `Dockerfile.web` `COPY` accordingly.
- **Package manager**: pnpm 10 stays (workspace + catalog). Nx is the orchestrator; Bun runs `apps/server` and `apps/web` at runtime only. Future non-JS apps become additional Nx projects (polyglot) with no change to the JS workspace.
