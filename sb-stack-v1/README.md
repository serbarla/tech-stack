# sb-stack-v1

## Installation

> [!NOTE]
>
> Make sure to follow the system requirements specified in [`package.json#engines`](./package.json#L4) before proceeding. The server runs on [Bun](https://bun.sh); everything else runs on Node 22 + pnpm 10.

## About

A T3-style monorepo orchestrated by [Nx](https://nx.dev) (the `package-json` plugin infers every `package.json` script as an Nx target). The stack has migrated away from the original starter: Turborepo, Next.js/TanStack web apps, tRPC and Drizzle/Supabase are gone.

Current stack:

- **API**: [Elysia](https://elysiajs.com) on Bun, consumed by clients through [Eden](https://elysiajs.com/eden) treaties (fully typesafe, no code generation)
- **Auth**: [better-auth](https://www.better-auth.com) mounted directly into the Elysia app, with the Expo plugin
- **Database**: SQLite via `node:sqlite`, accessed through [MikroORM 7](https://mikro-orm.io) with a [Kysely](https://kysely.dev) escape hatch (`orm.em.getKysely()`)
- **Web**: SolidJS (`solid-js` 2.0 rc) + Vite Plus + filesystem routing + Tailwind CSS v4
- **Mobile**: Expo SDK 58, React Native 0.88 / React 19, Expo Router, Reanimated 4 + Safe Area Context, Uniwind (Tailwind v4), TanStack Query
- **Validation**: shared zod v4 schemas in `@acme/validators`

```text
.github
  └─ workflows
        └─ CI (lint, format, typecheck, web check) with pnpm cache setup
.vscode
  └─ Recommended extensions and settings for VSCode users
apps
  ├─ expo
  │   ├─ Expo SDK 58
  │   ├─ React Native 0.88 using React 19
  │   ├─ Navigation using Expo Router
  │   ├─ Tailwind CSS v4 using Uniwind
  │   └─ Typesafe API calls using Eden treaty + TanStack Query
  ├─ server
  │   └─ Bun + Elysia server (port 3000); mounts better-auth handlers and API routes
  └─ web
      ├─ SolidJS built with Vite Plus (port 3001)
      ├─ Routing via filesystem-routing + @solidjs/router
      ├─ Tailwind CSS v4
      └─ Typesafe API calls using Eden treaty + better-auth client
packages
  ├─ api
  │   └─ Elysia app factory (`createApp`) + routes; exports the `App` type for Eden
  ├─ auth
  │   └─ better-auth on node:sqlite; email & password, Expo plugin
  ├─ db
  │   └─ MikroORM 7 (SqliteDriver + NodeSqliteDialect), entities, migrations, Kysely
  └─ validators
      └─ Shared zod v4 schemas (e.g. `CreatePostSchema`)
tooling
  ├─ eslint
  │   └─ shared, fine-grained, eslint presets
  ├─ prettier
  │   └─ shared prettier configuration
  ├─ tailwind
  │   └─ shared tailwind theme and configuration
  ├─ typescript
  │   └─ shared tsconfig you can extend from
  └─ github
      └─ composite GitHub Actions setup (`./tooling/github/setup`) used by CI
```

> In this template, we use `@acme` as a placeholder for package names. As a user, you might want to replace it with your own organization or project name. You can use find-and-replace to change all the instances of `@acme` to something like `@my-company` or `@project-name`.

## Quick Start

> **Note**
> The [db](./packages/db) package uses a local SQLite file (`DATABASE_URL`, default `data/sqlite.db`) through `node:sqlite` — no Postgres or Supabase required. If you're using something else, adapt the [driver](./packages/db/src/index.ts), the [entities](./packages/db/src/entities) and the MikroORM config.

To get it running, follow the steps below:

### 1. Setup dependencies

```bash
# Install dependencies
pnpm i

# Environment variables are declared in `.env.schema` (root) with safe defaults —
# a fresh clone runs with zero setup. Real secrets go in a gitignored `.env.local`,
# encrypted at rest: put `AUTH_SECRET=…` there, then run
# pnpm exec varlock encrypt --file .env.local

# Apply MikroORM migrations (creates the `post` table)
pnpm db:migrate

# Start server + web + expo in parallel
pnpm dev
```

- **web**: http://localhost:3001
- **server**: http://localhost:3000 (Elysia; better-auth routes under `/api/auth`)

Environment variables (see `.env.schema`):

| Variable          | Purpose                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`    | SQLite file path (`data/sqlite.db` locally, `/data/sqlite.db` in Docker)     |
| `BETTER_AUTH_URL` | Public URL of the Elysia server (better-auth base URL)                       |
| `PORT`            | Server port (default `3000`)                                                 |
| `AUTH_SECRET`     | better-auth secret (`openssl rand -base64 32`)                               |
| `VITE_API_URL`    | Base URL the web app uses to reach the API (default `http://localhost:3000`) |

### 2. Auth schema

No separate auth-schema generation step is needed: `initAuth` in [packages/auth](./packages/auth/src/index.ts) runs better-auth's own migrations against the same SQLite file at server boot, and MikroORM migrations handle the app tables (`pnpm db:migration:create` to generate new ones).

### 3. The example app

The repo ships a small Post CRUD demo wired end-to-end:

- `GET /api/posts`, `GET /api/posts/:id` — public, served with Kysely / MikroORM
- `POST /api/posts`, `DELETE /api/posts/:id` — require a session (`auth: true` middleware), validated with `CreatePostSchema`
- `GET /api/protected` — auth-gated sample

Both the web and Expo apps sign in with email and password via `authClient` and render the post list.

### 4. Configure Expo `dev`-script

#### Use iOS Simulator

1. Make sure you have XCode and XCommand Line Tools installed [as shown on expo docs](https://docs.expo.dev/workflow/ios-simulator).

   > **NOTE:** If you just installed XCode, or if you have updated it, you need to open the simulator manually once. Run `npx expo start` from `apps/expo`, and then enter `I` to launch Expo Go. After the manual launch, you can run `pnpm dev` in the root directory.

   ```diff
   +  "dev": "expo start --ios",
   ```

2. Run `pnpm dev` at the project root folder.

#### Use Android Emulator

1. Install Android Studio tools [as shown on expo docs](https://docs.expo.dev/workflow/android-studio-emulator).

2. Change the `dev` script at `apps/expo/package.json` to open the Android emulator.

   ```diff
   +  "dev": "expo start --android",
   ```

3. Run `pnpm dev` at the project root folder.

### 5. Configuring Better-Auth to work with Expo

In order to get Better-Auth to work with Expo, you must either:

#### Deploy the Auth Proxy (RECOMMENDED)

Better-auth comes with an [auth proxy plugin](https://www.better-auth.com/docs/plugins/oauth-proxy), and it is already enabled in [packages/auth](./packages/auth/src/index.ts). By deploying the app that serves your API, you can get OAuth working in preview deployments and development for Expo apps.

By using the proxy plugin, your server will forward any auth requests to the proxy server, which will handle the OAuth flow and then redirect back. This makes it easy to get OAuth working since you'll have a stable URL that is publicly accessible and doesn't change for every deployment and doesn't rely on what port the app is running on. So if port 3000 is taken and your app starts at port 3001 instead, your auth should still work without having to reconfigure the OAuth provider.

#### Add your local IP to your OAuth provider

You can alternatively add your local IP (e.g. `192.168.x.y:$PORT`) to your OAuth provider. This may not be as reliable as your local IP may change when you change networks. Some OAuth providers may also only support a single callback URL for each app making this approach unviable for some providers (e.g. GitHub).

### 6a. When it's time to add a new package

To add a new package, create a folder under `packages/` with a `package.json` named `@acme/<name>`. The Nx `package-json` plugin infers every script as a target automatically, so no registration is needed.

Set up the `package.json`, `tsconfig.json` and a `index.ts`, and extend the shared tooling packages (`@acme/eslint-config`, `@acme/prettier-config`, `@acme/tsconfig`) to configure formatting, linting and typechecking for the new package.

## Server hardening & observability

All served by `createApp` in [packages/api](./packages/api/src/index.ts):

- `GET /healthz` — public liveness probe (`{"ok":true}`, no auth), suitable for container healthchecks.
- Security headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, plus `Strict-Transport-Security: max-age=31536000; includeSubDomains` when `NODE_ENV=production`.
- `GET /swagger` (UI) and `GET /swagger/json` (OpenAPI 3.0.3) generated from the mounted routes. `@elysiajs/swagger` is pinned to `1.0.5` in the catalog: newer versions pull `@scalar/*`, which crashes under the repo's `zod<4` security override (spec 20 divergence 1).
- `/api/auth/*` rate limit: 60 requests/minute per IP (`x-forwarded-for`, else the socket address), answering `429` with `{"error":"Too many requests"}`. Blocked requests are logged too.
- One stdout log line per response — `METHOD path status durationMs` — silenced when `NODE_ENV=test`.
- Production fail-fast: the server exits non-zero at boot if `AUTH_SECRET` is unset or still the `local-dev-placeholder-not-for-prod` default.

## Docker

```bash
# One-time: supply the deploy config to compose (shell or .env, never committed)
export AUTH_SECRET="$(openssl rand -base64 32)"
export BETTER_AUTH_URL="http://your-host:3000"   # public URL of the Elysia server
export VITE_API_URL="http://your-host:3001"      # public origin of the web app

docker compose up --build
```

- **server**: Bun image; runs `mikro-orm migration:up` at boot, then serves Elysia on port 3000. SQLite persists in the `sb-data` named volume (`/data/sqlite.db`) — a named volume keeps the non-root `bun` user writable on Linux hosts, where a `./data` bind mount would be created root-owned and refuse writes. Inspect or back up the DB with `docker compose cp server:/data/sqlite.db ./data/sqlite.db` (stop the server first for a consistent copy).
- **web**: builds `@acme/web` with `pnpm nx run @acme/web:build` and serves the static bundle via nginx on port 3001.

Compose passes `AUTH_SECRET` and `BETTER_AUTH_URL` straight through to the server container (list-syntax `environment:`), so your shell/`.env` values win over the `.env.schema` defaults. The container always serves port 3000 — the port map and healthcheck hardcode it, and `PORT` is deliberately not passed through so a stray host `PORT` cannot wedge the healthcheck. The container boots with `NODE_ENV=production`, so startup is fail-fast: if `AUTH_SECRET` is unset or still the dev placeholder, or `BETTER_AUTH_URL` is unset or still points at `http://localhost`, the server refuses to start and exits non-zero. There is no frozen-env file — config resolves at boot via varlock, and the image builds from a fresh clone with no secrets.

Both services declare healthchecks: the server answers `GET /api/auth/ok`, web waits for it (`depends_on: condition: service_healthy`) and answers on port 80. The web image's nginx (`nginx/web.conf`) serves the static bundle and proxies `/api/` to `http://server:3000`, so same-origin deployments work out of the box — the web image build requires `VITE_API_URL`, the public origin of the web app (e.g. `http://host:3001`), which the bundle uses to reach that proxy: compose refuses to build without it and the Dockerfile hard-fails on an empty build-arg, so a production bundle can never silently embed `http://localhost:3000`.

## CI

[.github/workflows/ci.yml](./.github/workflows/ci.yml) runs `env`, `lint`, `format`, `typecheck`, `@acme/web:check`, `test`, `e2e`, `build` (Nx production build), `docker` (`docker compose build` — both images, no secrets needed), `expo` (`expo install --check` SDK drift gate + `expo export --platform ios` JS-bundle smoke build), `audit` (`pnpm audit --audit-level high`, enforced via the `overrides` pins in [pnpm-workspace.yaml](./pnpm-workspace.yaml)) and `secret-scan` (gitleaks, config in [.gitleaks.toml](./.gitleaks.toml)) jobs on PRs, `master` pushes and merge queues, all using the composite setup action in `tooling/github/setup` (the `env` job validates the `.env.schema` contracts; no `.env` copy needed). Dependency updates are handled by Renovate.

This repo publishes on `master`, so both the CI push trigger and Nx's affected base (`"defaultBase"` in [nx.json](./nx.json)) point at `master`. Template adopters whose default branch is `main` must flip `"defaultBase"` back to `main` after export, or `nx affected` will diff against a branch that doesn't exist.

## FAQ

### Does this pattern leak backend code to my client applications?

No, it does not. The `api` package should only be a production dependency in the server application where it's served. The Expo and web apps import only the `App` type from `@acme/api` to build their Eden treaties — a type-only import that is fully erased at build time — so keep it as a dev dependency there. This gives you full typesafety in your client applications while keeping your backend code safe.

If you need to share runtime code between the client and server, such as input validation schemas, that's what `@acme/validators` is for; import it on both sides.

## Deployment

### Expo

Deploying your Expo application works slightly differently compared to deploying a web app. Instead of "deploying" your app online, you need to submit production builds of your app to app stores, like [Apple App Store](https://www.apple.com/app-store) and [Google Play](https://play.google.com/store/apps). You can read the full [guide to distributing your app](https://docs.expo.dev/distribution/introduction), including best practices, in the Expo docs.

1. Set `EXPO_PUBLIC_API_URL` (declared in [apps/expo/.env.schema](./apps/expo/.env.schema)) to your backend's public URL — it is inlined into the JS bundle at build time and used as the API base whenever the Expo dev client is not attached.

2. Let's start by setting up [EAS Build](https://docs.expo.dev/build/introduction), which is short for Expo Application Services. The build service helps you create builds of your app, without requiring a full native development setup. The commands below are a summary of [Creating your first build](https://docs.expo.dev/build/setup).

   ```bash
   # Install the EAS CLI
   pnpm add -g eas-cli

   # Log in with your Expo account
   eas login

   # Configure your Expo app
   cd apps/expo
   eas build:configure
   ```

3. After the initial setup, you can create your first build. You can build for Android and iOS platforms and use different [`eas.json` build profiles](https://docs.expo.dev/build-reference/eas-json) to create production builds or development, or test builds. Let's make a production build for iOS.

   ```bash
   eas build --platform ios --profile production
   ```

   > If you don't specify the `--profile` flag, EAS uses the `production` profile by default.

4. Now that you have your first production build, you can submit this to the stores. [EAS Submit](https://docs.expo.dev/submit/introduction) can help you send the build to the stores.

   ```bash
   eas submit --platform ios --latest
   ```

   > You can also combine build and submit in a single command, using `eas build ... --auto-submit`.

5. Before you can get your app in the hands of your users, you'll have to provide additional information to the app stores. This includes screenshots, app information, privacy policies, etc. _While still in preview_, [EAS Metadata](https://docs.expo.dev/eas/metadata) can help you with most of this information.

6. Once everything is approved, your users can finally enjoy your app. Let's say you spotted a small typo; you'll have to create a new build, submit it to the stores, and wait for approval before you can resolve this issue. In these cases, you can use EAS Update to quickly send a small bugfix to your users without going through this long process. Let's start by setting up EAS Update.

   The steps below summarize the [Getting started with EAS Update](https://docs.expo.dev/eas-update/getting-started/#configure-your-project) guide.

   ```bash
   # Add the `expo-updates` library to your Expo app
   cd apps/expo
   pnpm expo install expo-updates

   # Configure EAS Update
   eas update:configure
   ```

7. Before we can send out updates to your app, you have to create a new build and submit it to the app stores. For every change that includes native APIs, you have to rebuild the app and submit the update to the app stores. See steps 2 and 3.

8. Now that everything is ready for updates, let's create a new update for `production` builds. With the `--auto` flag, EAS Update uses your current git branch name and commit message for this update. See [How EAS Update works](https://docs.expo.dev/eas-update/how-eas-update-works/#publishing-an-update) for more information.

   ```bash
   cd apps/expo
   eas update --auto
   ```

   > Your OTA (Over The Air) updates must always follow the app store's rules. You can't change your app's primary functionality without getting app store approval. But this is a fast way to update your app for minor changes and bug fixes.

9. Done! Now that you have created your production build, submitted it to the stores, and installed EAS Update, you are ready for anything!

### Server & Web

`docker compose up --build` is the reference deployment: Elysia on Bun (port 3000, migrations run at boot, SQLite in the `sb-data` named volume) and the built Solid bundle behind nginx (port 3001). Point `BETTER_AUTH_URL` and the clients' API base URL at your public host.
