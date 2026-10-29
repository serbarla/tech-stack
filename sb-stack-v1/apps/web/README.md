# SB Stack — web

The Solid app of the SB Stack template: `@solidjs/router` with file-system routes, per-page titles via `@solidjs/meta`, API calls through Eden Treaty (`src/lib/api.ts`), and a sample `vitest` unit suite.

**Deployment contract:** zero server dependencies — `pnpm build` emits a purely static site (`dist/client`, routes code-split); deploy it to any static host or serve it with the provided nginx image (`Dockerfile.web`). There is no `start` script: on platforms that build and then run `npm start` in a Node container, pick the static product instead.

## How it works

There is no `index.html` and no mount file. `@solidjs/vite-plugin`'s turnkey mode (`start: true` in `vite.config.ts`) generates the entries around two conventions:

- **`src/App.tsx`** — the app, router included. The `<Router>` wraps a shared nav and a `<Loading>` boundary; its routes come from the file system (below).
- **`src/Document.tsx`** — the document shell, the new `index.html`. Site-wide head tags go here; it is compiled only into the prerendered static shell and adds **zero client-side JS**. Per-page head tags (`<Title>` from `@solidjs/meta`) live in the route modules.

## File-system routing

The `fileRoutes()` plugin (from `filesystem-routing/vite`) scans `src/routes` and exposes the result as the `virtual:file-routes` module, which `@solidjs/router/fs` turns into router routes inside `src/App.tsx`. You edit files under `src/routes`; the route table follows:

- `index.tsx` is `/`, `users/index.tsx` is `/users`, `users/[id].tsx` is `/users/:id`, `[...404].tsx` catches everything else.
- Pairing `users.tsx` with the `users/` directory makes it a layout wrapping every page inside; `users/index.tsx` is what the layout shows at `/users` itself.
- A module is a page when it has a **default export** (a file without one is not a route), and may export a `route` config object — `src/routes/users/[id].tsx` uses `preload` to start its data load as navigation begins.

Every route is code-split automatically; navigating loads only that page's module.

## Data loading

`src/routes/users/[id].tsx` shows the data pattern: an async `query()` (from `@solidjs/router`) read through a memo. The surrounding `<Loading>` boundary in `App.tsx` shows its fallback until the promise settles, and `query()` caches by key so preload and render share one request. The sample data is a local JSON module (`src/lib/users.json`); swap the query body for any API call.

## API access

`src/lib/api.ts` builds an Eden Treaty client against the API server; its base URL comes from `VITE_API_URL` (declared in `.env.schema`, default `http://localhost:3000`). In the Docker deployment the web bundle is built with `VITE_API_URL` set to the web origin so calls go through the nginx `/api` proxy.

## Testing

- **Unit** — `pnpm --filter @acme/web test` runs `vitest` in jsdom via `@solidjs/testing-library`; add `*.test.tsx` files under `src/` (the runner's include is `src/**/*.test.{ts,tsx}`, so the Playwright specs under `e2e/` are never collected). See `src/components/Counter.test.tsx` for the pattern; note Solid batches DOM updates, so tests call `flush()` after firing events before asserting on the DOM.
- **E2E** — `pnpm --filter @acme/web e2e` runs Playwright (`e2e/auth.spec.ts`), which boots the API server and the web dev server itself (see `playwright.config.ts`).

## Available scripts

Run from `apps/web/` (or `pnpm --filter @acme/web <script>` from the repo root):

- `pnpm dev` — dev server at [http://localhost:3001](http://localhost:3001) (the API server runs separately at 3000).
- `pnpm build` — static production build to `dist/client`.
- `pnpm test` — unit suite (`vp test`).
- `pnpm e2e` — Playwright suite.
- `pnpm check` / `pnpm lint` / `pnpm format` / `pnpm typecheck` — the quality gates CI runs.

## The `ssr` flip

Streaming SSR is one boolean: add `ssr: true` next to `start: true` in `vite.config.ts`. `src/App.tsx`, `src/Document.tsx`, and the routes carry over unchanged — `<HydrationScript />` is already in place in the Document (in client mode it is stripped from the static shell). The build then emits a request handler to `dist/server`.

Learn more on the [Solid website](https://solidjs.com).
