# Spec 12 — Phase L: Email & password (server + both clients)

- Source: `BETTER_AUTH_EMAIL_PASSWORD_PLAN.md` → `### Phase 2`.
- Depends on: spec 11 (Discord gone; `AuthShowcase` fallback is `fallback={null}`, `MobileAuth`'s logged-out slot is `null`), spec 05 (both apps' `authClient` and session plumbing).
- Repo root: `sb-stack-v1/`. All paths/commands relative to it, except `specs/…` paths, which are relative to the project root that contains `sb-stack-v1/`.
- Result carried forward: `emailAndPassword: { enabled: true }` is the only auth-behavior change in `packages/auth` (`requireEmailVerification` omitted = false, `autoSignIn` omitted = true — sign-up returns a session immediately, password min length stays better-auth's default 8; reset/verification endpoints stay unconfigured and unused); web and Expo each render one email/password form with a sign-in/sign-up toggle whose exact labels and button names are the spec 14 e2e selectors; the auth tables still come from better-auth's boot-time auto-migration until spec 13 replaces it.

## Testing 

Unit testing is not required, avoid it, end to end testing and integration testing are piorities

Read the nearest `AGENTS.md` (target workspace, then parents up to repo root)
before executing. If reality diverges from this spec: stop, append the
divergence under Testing criteria, NEVER improvise outside the objectives.

## 1. Objectives

- [ ] 1. Enable email & password in `packages/auth/src/index.ts` — requirements: add to the `BetterAuthOptions` config exactly:
  ```ts
  emailAndPassword: {
    enabled: true,
  },
  ```
  Nothing else: `requireEmailVerification` omitted (= false), `autoSignIn` omitted (= true, sign-up returns a session immediately), password min length stays better-auth's default 8; no `sendResetPassword`/`sendVerificationEmail` — those endpoints stay unconfigured and unused; commands: `grep -n "emailAndPassword\|requireEmailVerification\|autoSignIn\|sendResetPassword\|sendVerificationEmail" packages/auth/src/index.ts` (only `emailAndPassword` appears)

- [ ] 2. Build the web form in the `AuthShowcase` fallback (`apps/web/src/routes/index.tsx`) — requirements: reuse the `CreatePostForm` signal/error patterns and follow `apps/web/AGENTS.md`'s Solid 2 primer (reads in JSX/handlers only; `affects(x); refresh(x)` to refetch); the labels and button names below are the spec 14 e2e selectors — keep them exact; state: `mode = createSignal<"signin" | "signup">("signin")`, `name`, `email`, `password` (each `createSignal("")`), `formError = createSignal<string | null>(null)`; the fallback renders `<form class="auth-form" onSubmit={submit}>` with: `<h2>` text `Create account` (signup) / `Sign in` (signin); a Name field only when `mode() === "signup"` — `<label>Name<input type="text" required value={name()} onInput={...} /></label>`; `<label>Email<input type="email" required .../></label>`; `<label>Password<input type="password" required minlength={8} .../></label>`; `<Show when={formError()}>{(m) => <p class="form-error">{m()}</p>}</Show>`; a submit button text `Sign up` (signup) / `Sign in` (signin); a toggle button text `Need an account? Sign up` (signin) / `Have an account? Sign in` (signup) whose `onClick` flips `mode`; `submit` runs `event.preventDefault()` then signup → `const { error } = await authClient.signUp.email({ name: name(), email: email(), password: password() })`, signin → `const { error } = await authClient.signIn.email({ email: email(), password: password() })`; on `error`: `setFormError(error.message)`; on success: clear `name`/`email`/`password`, `setMode("signin")`, then `affects(props.session); void refresh(props.session);` — the same refetch pattern the existing `signOut` uses (better-auth's vanilla client also toggles its session signal on auth actions, but the Solid memo holds a stale promise, hence the explicit refresh); `signOut` and the signed-in block (`Signed in as {user().name ?? user().email}`, `Sign out` button) stay as-is; commands: `pnpm nx run @acme/web:check`

- [ ] 3. Build the Expo form in `MobileAuth` (`apps/expo/src/app/index.tsx`) — requirements: React Native `useState` (from `react`, already imported): `mode` (`"signin" | "signup"`, default `"signin"`), `name`, `email`, `password`, `error` (string|null); when `session` is falsy render the existing `Not logged in` greeting text, then (signup mode only) a `TextInput` for name, `TextInput`s for email and password (`secureTextEntry`, `autoCapitalize="none"`), reusing the existing input className `border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight`; an error `<Text className="text-destructive">` when `error` (reuse `CreatePost`'s error-text styling); a submit `Pressable` labeled `Sign up`/`Sign in`; a toggle `Pressable` labeled `Need an account? Sign up` / `Have an account? Sign in` flipping `mode`; submit runs `const { error } = mode === "signup" ? await authClient.signUp.email({ name, email, password }) : await authClient.signIn.email({ email, password });` → on `error` `setError(error.message)`; on success clear the fields, `setMode("signin")`, `setError(null)` — the `authClient.useSession()` hook refreshes automatically (the client toggles its `$sessionSignal` after matched auth actions — verified in `better-auth/dist/client/proxy.mjs`'s onSuccess listener dispatch); when `session` is truthy: greeting + `Sign Out` `Pressable` (as today); form and greeting are mutually exclusive; commands: `pnpm nx run @acme/expo:typecheck`

## 2. No-go

- Do not add password reset or email verification — no `sendResetPassword`/`sendVerificationEmail`, no `emailVerification` config, no reset/verify UI (no email provider exists; better-auth's `requireEmailVerification: false` default applies).
- Do not set `requireEmailVerification: true`, flip `autoSignIn: false`, or change the password minimum from better-auth's default 8.
- Do not split auth into separate routes (`/sign-in`, `/sign-up`) — the single form with a toggle is the contract on both platforms.
- Do not rename any label or button text in the forms — they are the spec 14 e2e selectors — and do not change `signOut`, the signed-in block, or the session plumbing beyond the specified success-path refresh.
- Do not touch the boot-time better-auth migration (spec 13 owns it), the env schemas, or the `initAuth` signature.
- Do not write test suites (spec 14 owns testing) and do not add unit tests.

## 3. Testing criteria

*All boxes checked = spec done.*

- [ ] `pnpm lint && pnpm format && pnpm typecheck` exit 0 (repo root).
- [ ] objective 1: `grep -n "emailAndPassword\|requireEmailVerification\|autoSignIn\|sendResetPassword\|sendVerificationEmail" packages/auth/src/index.ts` shows only the `emailAndPassword` literal — the other four names never appear.
- [ ] objective 2 server smoke (better-auth still auto-migrates at boot until spec 13): `pnpm --filter @acme/server dev` boots clean; `curl -s -i -X POST http://localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' -d '{"name":"Ada","email":"ada@example.com","password":"password1234"}'` → `200` with a `set-cookie: better-auth.session_token=…` header; `GET /api/auth/get-session` with that cookie → `200` and `user.email === "ada@example.com"`; `POST /api/auth/sign-in/email` with `wrong-password` → not ok, body `code === "INVALID_EMAIL_OR_PASSWORD"`; `POST /api/auth/sign-out` with the cookie → ok.
- [ ] objective 2 web form (manual browser — automation lands in spec 14): with the server running and `pnpm --filter @acme/web dev` serving http://localhost:3001: the fallback shows the sign-in form; the toggle switches to `Create account` with the Name field; sign up `web@example.com`/`password1234` → `Signed in as …`; `Sign out` → the form returns; sign in with `wrong-password` → `.form-error` text matches `/invalid/i`; every label/button matches objective 2 exactly.
- [ ] objective 3 Expo manual smoke (no simulator in CI — plan Verification 5): `cd apps/expo && CI=false pnpm exec expo start --ios --go` with the server running: sign up `mobile@example.com`/`password1234` → greeting shows the name; create a post → it appears in the list; `Sign Out` → the form returns.
- [ ] every objective in section 1 is checked (divergences, if any, appended here).

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

None.

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
