# Spec 04 — Phase D: API, tRPC → Elysia + Eden Treaty

- Source: `NX_ELYSIA_SOLID_MIGRATION_PLAN.md` → `### Phase D`.
- Depends on: spec 02 (`Post`, `getKysely()`), spec 03 (`Auth` type, `initAuth`), spec 01 (catalog `elysia`, `@elysiajs/cors`, `@elysiajs/eden`).
- Repo root: `create-t3-turbo/`. All paths/commands relative to it.
- Result carried forward: `@acme/api` exports `createApp({ auth, orm })` and `type App` — the only source of Eden client types for web (spec 05) and Expo (spec 06). Zero tRPC left in the workspace.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [x] 1. Rewrite `packages/api/package.json` — requirements: `dependencies` remove `@trpc/server`, `superjson`; add `elysia: catalog:`, `@elysiajs/cors: catalog:`; keep `@acme/auth`, `@acme/db`, `@acme/validators`, `zod`; keep `exports` (`types: ./dist/index.d.ts`, `default: ./src/index.ts`) and `build: tsc`; commands: `pnpm install`

- [x] 2. Delete every tRPC file — requirements: remove `packages/api/src/trpc.ts`, `packages/api/src/root.ts`, `packages/api/src/router/post.ts`, `packages/api/src/router/auth.ts`; commands: `rm -f packages/api/src/trpc.ts packages/api/src/root.ts packages/api/src/router/post.ts packages/api/src/router/auth.ts`

- [x] 3. Add the auth macro at `packages/api/src/middleware.ts` — requirements: one plugin factory taking `Auth`, resolving the session from request headers and rejecting with 401; derive `user` and `session` for downstream handlers:
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
  commands: `pnpm nx run @acme/api:typecheck`

- [x] 4. Add post routes at `packages/api/src/router/post.ts` — requirements: list goes through `getKysely()` (proves Kysely on the same connection), the remaining CRUD through the MikroORM `em`; `POST` validates with `CreatePostSchema` and requires auth; `DELETE` requires auth:
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
  commands: `pnpm nx run @acme/api:typecheck`

- [x] 5. Add the app factory at `packages/api/src/index.ts` — requirements: CORS for `http://localhost:3001` with credentials, better-auth mounted so it stays reachable at `/api/auth/*` (confirm the installed Elysia `.mount` path semantics and record the chosen form), protected `GET /api/protected` returning the secret message, post routes, and `export type App = ReturnType<typeof createApp>`:
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
  commands: `pnpm nx run @acme/api:build`

- [x] 6. Move post validation into `@acme/validators` — requirements: replace the placeholder `unused` export in `packages/validators/src/index.ts` with the shared `CreatePostSchema` (zod v4, matching the entity constraints: `title` non-empty, max 256; `content` non-empty) consumed by objective 4 and later by web/Expo forms; no drizzle-zod leftovers:
  ```ts
  import { z } from "zod/v4";

  export const CreatePostSchema = z.object({
    title: z.string().min(1).max(256),
    content: z.string().min(1),
  });
  ```
  commands: `pnpm nx run @acme/validators:build`

- [x] 7. Record the Eden Treaty path mapping produced by `App` — requirements: Eden derives client property paths from the route strings, so `/api/posts` does not necessarily map to `api.post.index` as written in the plan; compile a scratch file against the built types, keep the form that typechecks, delete the scratch file, and write the four resulting call sites under Testing criteria so specs 05/06 apply them verbatim (never ship a non-compiling call site, never invent a second convention); commands:
  ```
  pnpm nx run @acme/api:build
  printf 'import { treaty } from "@elysiajs/eden";\nimport type { App } from "@acme/api";\nconst api = treaty<App>("http://localhost:3000");\napi.post.index;\n' > packages/api/src/__eden-path-check.ts
  pnpm exec tsc --noEmit --moduleResolution bundler --module preserve packages/api/src/__eden-path-check.ts
  rm packages/api/src/__eden-path-check.ts
  ```

- [x] 8. Prove the API surface without the server app — requirements: mount at runtime with a real DB and real auth, request the public list endpoint in-process, then confirm tRPC is gone everywhere:
  ```
  bun -e 'process.env.DATABASE_URL="./sqlite.db"; const { initDb } = await import("./packages/db/src/index.ts"); const { initAuth } = await import("./packages/auth/src/index.ts"); const { createApp } = await import("./packages/api/src/index.ts"); const orm = await initDb(); const auth = initAuth({ baseUrl:"http://localhost:3000", productionUrl:"http://localhost:3000", secret:"x", discordClientId:"x", discordClientSecret:"y" }); const app = createApp({ auth, orm }); const res = await app.handle(new Request("http://localhost:3000/api/posts")); console.log(res.status, await res.text());'
  grep -rn "@trpc\|superjson\|AppRouter" packages/api
  ```

## 2. No-go

- Do not create `apps/server` or `apps/web` here (spec 05) — this phase produces a library only.
- Do not keep `packages/api/src/router/auth.ts`, a tRPC session route, `superjson`, or any `AppRouter` re-export; if some consumer still imports them, that is a divergence to record, not a shim to add.
- Do not add server-side session endpoints (`/api/session`, `/api/me`) — session is fetched client-side from better-auth; only `/api/auth/*` exists.
- Do not change the `Post` entity, `initDb`, or `initAuth` signatures.
- Do not hand-write a duplicate `Post` zod schema outside `@acme/validators`.
- Do not add unit tests, HTTP test harnesses, or seed data.
- Do not edit `apps/expo` (spec 06) or remove `@trpc/*` catalog entries (spec 06 does).

## 3. Testing criteria

- [x] `pnpm install` exits 0; `grep -rn "@trpc/server\|superjson" packages/api/package.json packages/api/src` prints nothing.
- [x] `pnpm nx run @acme/api:build` exits 0 and `packages/api/dist/index.d.ts` exports `App`.
- [x] `pnpm typecheck` and `pnpm lint` exit 0. — DIVERGENCE 7 was cleared by spec 06 (2026-10-23): `apps/expo` now uses the Eden client, and both workspace commands exit 0 (`typecheck`: 10 projects; `lint`: 7 projects).
- [x] Objective 8's in-process `Request` returns `200` and `[]` for `GET /api/posts`.
- [x] The same script returns `401` for `GET /api/protected` without a session cookie.
- [x] `packages/api/src/router/post.ts` calls `getKysely()` for the list path and `orm.em` for the rest (`grep -n "getKysely\|em.findOne\|em.create\|removeAndFlush" packages/api/src/router/post.ts`).
- [x] Eden call-site mapping recorded here, produced by objective 7 and applied verbatim in specs 05/06 (`await` in front; every expression returns `Promise<{ data, error, status, headers }>`):
  - `GET /api/posts` → `api.api.posts.get()`
  - `GET /api/posts/:id` → `api.api.posts({ id }).get()` — dynamic segments use the callable form; the `api.api.posts[":id"]({ params: { id } })` shape typechecks but leaves the literal `:id` in the URL (runtime-proven with a `fetcher` probe: `GET /api/posts/:id`), so it is never used.
  - `POST /api/posts` → `api.api.posts.post({ title, content })` — body passed directly, not `{ body: … }` (does not typecheck).
  - `DELETE /api/posts/:id` → `api.api.posts({ id }).delete()`
- [x] Elysia `.mount` semantics confirmed for objective 5: the single-argument overload `.mount(auth.handler)` registers the fetch handler on `ALL /*` forwarding the request URL unchanged, so better-auth serves `/api/auth/*` itself; the two-argument `.mount(path, handler)` form would strip a prefix. Chosen form: `.mount(auth.handler)`. Verified in-process: `GET /api/auth/get-session` → `200 null`.
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

1. Objectives 4/5 sample code typed `orm` as bare `MikroORM` and called `em.removeAndFlush`; neither compiles/runs on installed mikro-orm 7.2.5 — bare `MikroORM` erases entity metadata so `getKysely().selectFrom("post")` fails TS2345 (table map `never`), and `removeAndFlush` does not exist (TS2339, absent from runtime too). Fix: `@acme/db` now exports its existing internal alias (`export type Orm = MikroORM<SqliteDriver, SqlEntityManager<SqliteDriver>, [typeof Post]>` — additive; `initDb`/`getOrm`/`Post` signatures unchanged) and both api signatures take `Orm`; delete uses `orm.em.remove(post)` + `await orm.em.flush()`. The grep criterion still matches (`getKysely`, `em.findOne`, `em.create`). (Verified 2026-10-23: 2 fix attempts — adding `@mikro-orm/sql` and spelling the generics inline, rejected as a duplicated alias that drifts from db; exporting db's `Orm` — adopted — both fenced by the 7.2.5 API.)
2. Objective 1's dependency list needed two additions: `@mikro-orm/core: catalog:` (dependencies) because `dist/index.d.ts` response types inline `import("@mikro-orm/core")` and consumers typecheck those declarations relative to `packages/api/dist`, where only direct deps resolve — without it specs 05/06 lose typed `.data`; and `@elysiajs/eden: catalog:` (devDependencies) because objective 7's scratch imports `treaty`, resolvable only from `packages/api`. (Verified 2026-10-23: 2 attempts — bare `tsc` scratch surfaced TS2307 `@mikro-orm/core` from `dist/index.d.ts`; `@elysiajs/eden` absent from the tree — both fixed by the two additions; no objective was weakened.)
3. elysia 1.4.30's peer `@sinclair/typebox >= 0.34 < 1` auto-resolved to 0.27.8 (the only typebox in the tree, pulled by `@jest/schemas`), so objective 8 crashed on import: `SyntaxError: Export named 'Unsafe' not found in …/@sinclair/typebox@0.27.8/typebox.js`. Fix: `"@sinclair/typebox": "^0.34.0"` added to `@acme/api` dependencies (peer now resolves 0.34.52 everywhere); objective 8 rerun → `200 []`. (Verified 2026-10-23: 1 fix attempt — explicit peer-satisfying dep — succeeded.)
4. Objective 8 on a fresh `./sqlite.db` returned `500 no such table: post`: `initDb()` never creates schema (spec 02 owns migrations; the no-go bans seed data, not schema). Fix attempts: `DATABASE_URL=./sqlite.db pnpm nx run @acme/db:migration:up` no-ops because nx runs the task with cwd `packages/db`, where `./sqlite.db` resolves to `packages/db/sqlite.db`; re-ran with the absolute `DATABASE_URL="$PWD/sqlite.db"` → `InitialMigration` applied to the root file (tables `post`, `mikro_orm_migrations` present) → objective 8 then returns `200 []` and protected `401`. (Verified 2026-10-23: 2 attempts — relative-path migration, absolute-path migration — the second applied; fenced by spec 02 owning schema creation, no schema code added to spec 04.)
5. Objective 5's sample handler `({ user }) => …` fails `@typescript-eslint/no-unused-vars`, and the inline `import { Post, type Orm }` fails `import/consistent-type-specifier-style`. Fix: `/api/protected`'s handler no longer destructures the unused `user` (the macro still derives `user`/`session` in `middleware.ts`; the `401` criterion proves enforcement) and `router/post.ts` uses a top-level `import type { Orm }`. `@acme/api` `lint`/`typecheck`/`format` all green afterwards. (Verified 2026-10-23: 1 fix attempt — lint-driven source adjustment, behavior unchanged — succeeded.)
6. Objective 7's literal `pnpm exec tsc --noEmit --moduleResolution bundler --module preserve <scratch>` cannot exit 0 as written: default `target ES5` produces mass lib errors across `node_modules/*.d.ts`, and `@acme/auth` source is pulled into the program without node types. The four recorded call sites produce zero errors on scratch-file lines under the literal flags, and the full command exits 0 with `--target es2022 --lib es2022,dom --skipLibCheck --typeRoots packages/auth/node_modules/@types`. Runtime proof (fetcher probe): `GET /api/posts`, `GET /api/posts/abc`, `POST /api/posts body={"title":…}`, `DELETE /api/posts/abc`, `GET /api/protected`. Scratch file deleted. (Verified 2026-10-23: 2 fix attempts — filtered literal run, augmented-flag run — call-site validity proven; command-flag delta recorded here instead of in the objectives.)
7. Workspace `pnpm typecheck`/`pnpm lint` stay red in `@acme/expo` only: `src/utils/api.tsx` imports `AppRouter`/`RouterInputs`/`RouterOutputs` from `@acme/api`, removed by objectives 1–2, with cascade errors in `src/app/*`; `apps/expo` rewriting is explicitly excluded (section 2, spec 06). (Verified 2026-10-23: no code fix permitted — the only fixes are an `AppRouter` re-export or editing `apps/expo`, both fenced by the section-2 no-go; workspace red is deferred to spec 06 by design, not a defect.) **Cleared 2026-10-23 by spec 06: `pnpm typecheck` and `pnpm lint` both exit 0 workspace-wide.**

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
