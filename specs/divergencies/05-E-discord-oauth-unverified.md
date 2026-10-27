# 05-E — Discord OAuth sign-in round-trip unverified

- Source spec: `specs/05-E-apps-server-and-web.md` → divergence #9 and the two
  unchecked testing criteria:
  - "`pnpm nx run @acme/web:dev` serves `http://localhost:3001`; the rendered
    page lists posts; **a signed-in Discord user** can create a post and see it;
    sign-out hides the form."
  - Objective 15's "**Discord sign-in returns to `/`**".
- Status: **OPEN — blocked by an external prerequisite (real Discord app
  credentials), not by code.** Every non-Discord leg is proven.
- Recorded: 2026-10-23.

## What is broken

`sb-stack-v1/.env` ships `AUTH_DISCORD_ID=''` and
`AUTH_DISCORD_SECRET=''`. With empty values, better-auth warns at boot
("Social provider discord is missing clientId or clientSecret") and
`POST /api/auth/sign-in/social` returns **500 with an empty body**
(`BETTER AUTH API ERROR` inside `createAuthorizationURL`). The OAuth redirect to
Discord, the callback to `/`, and the browser-issued session cookie therefore
cannot be exercised end to end.

Everything else in the flow passed, at wire level and in the browser:

- `AuthShowcase`'s button issues the correct
  `POST http://localhost:3000/api/auth/sign-in/social` request.
- `POST /api/posts` from origin `http://localhost:3001` carries a
  `better-auth.session_token` cookie to port `3000` (captured in devtools).
- Signed-in UI, create-post, list refresh, and sign-out (form hidden) verified
  with a demo user + session seeded through better-auth's `internalAdapter`
  using a manually HMAC-signed session cookie (temporary script, deleted after
  the run).

## Why each fix attempt was fenced

- **Real Discord app credentials** (register an application, fill
  `AUTH_DISCORD_ID`/`AUTH_DISCORD_SECRET`): outside the repo and outside every
  spec's scope — an external prerequisite, so no spec-owned code fix exists.
- **Stubbing/faking the OAuth provider** (mock `createAuthorizationURL`, fake
  token exchange): would only test the mock; spec 05 objective 15 requires the
  real round-trip. Rejected as non-evidence.
- **Keeping the seeded session/user**: a hand-signed cookie proves the session
  machinery but not Discord sign-in; the seeding script was deleted to avoid
  leaving a fake-auth backdoor in the repo.

## How to clear it

1. Create a Discord application (Discord Developer Portal → OAuth2), add the
   redirect URI `http://localhost:3000/api/auth/callback/discord`, and put the
   client id/secret in `sb-stack-v1/.env`
   (`AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`).
2. Start the stack from `sb-stack-v1/`:
   ```
   pnpm nx run @acme/server:dev
   pnpm nx run @acme/web:dev
   ```
3. Open `http://localhost:3001`, click sign-in, complete Discord auth, confirm
   the return to `/` shows the signed-in UI, create a post (it appears in the
   list), then sign out (form hides).
4. Mark the two criteria `[x]` in `specs/05-E-apps-server-and-web.md`
   (section 3, the `- [ ]` "signed-in Discord user" criterion and the
   "all verified except the Discord OAuth round-trip" note in objective 15),
   update divergence #9's tracking link, and delete this file.

## Verification snapshot (2026-10-23)

- `grep -nE "AUTH_DISCORD_(ID|SECRET)" sb-stack-v1/.env` → both empty.
- `curl -X POST http://localhost:3000/api/auth/sign-in/social` → `500`, empty
  body; server logs `BETTER AUTH API ERROR`.
- Seeded-session path: `POST /api/posts` → 200 with the HMAC-signed
  `better-auth.session_token` cookie; `GET /api/posts` reflects the new row;
  `GET /api/auth/get-session` returns the demo user; sign-out clears it.
