## Repo

Nx + pnpm monorepo (T3-style); every `package.json` script is an Nx target. Bun runs the server, Node 22 + pnpm 10 everything else.

- `apps/server` — Elysia on Bun, port 3000; mounts better-auth (`/api/auth/*`) and the API.
- `apps/web` — SolidJS 2.0 + Vite Plus, port 3001; filesystem routing, Tailwind v4, Eden Treaty client.
- `apps/expo` — Expo SDK 58 / RN 0.88, Expo Router. Use `expo start --ios --go` (dev client is installed, so plain `--ios` expects a dev build); empty `CI=` breaks the CLI, use `CI=false`.
- `packages/api` — `createApp()` factory + post routes; clients import only its `App` type.
- `packages/auth` — better-auth on node:sqlite; Discord OAuth only (unconfigured in dev → sign-in returns 500), oAuthProxy + Expo plugins.
- `packages/db` — MikroORM 7 + Kysely escape hatch; SQLite file `data/sqlite.db` resolved by `getDatabasePath()`.
- `packages/validators` — shared zod v4 schemas. `packages/ui` is React/shadcn and unused by web.

Root commands: `pnpm i`, `pnpm db:migrate`, `pnpm dev` (server + web + expo), `pnpm lint|format|typecheck`.

Env is declared in `.env.schema`, resolved by **varlock** (overrides in `.env.local`). Quirk: the dev server signs auth cookies with the raw `.env.local` `AUTH_SECRET` value, while interactive `varlock printenv` returns the decrypted one — cookies verify only in the process that signed them.

## Testing

Unit testing is not required, avoid it, only end to end testing and integration testing are priorities

## Take into account first

Whenever you are asked to plan something, please do not assume, ask the user first before implementing.

## Bug Fixing

You may try 15 times to fix a bug, then, add it to a Linear Issue, following the approved format Specs-Issue