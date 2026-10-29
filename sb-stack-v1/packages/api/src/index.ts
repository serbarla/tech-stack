import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";

import type { Auth } from "@acme/auth";
import type { Orm } from "@acme/db";

import { startRequestLog, writeRequestLog } from "./logger";
import { authed } from "./middleware";
import { authRateLimit } from "./rate-limit";
import { postRoutes } from "./router/post";
import { SECURITY_HEADERS } from "./security";

export function createApp(options: { auth: Auth; orm: Orm }) {
  const { auth, orm } = options;
  return (
    new Elysia()
      .use(
        cors({
          origin: ["http://localhost:3001"],
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
          credentials: true,
          allowedHeaders: ["Content-Type", "Authorization"],
        }),
      )
      // Hooks must precede route registration: Elysia snapshots app-level
      // hooks into each route when it is added.
      .onRequest(({ request }) => {
        startRequestLog(request);
      })
      .use(authRateLimit)
      .onAfterHandle(({ set }) => {
        Object.assign(set.headers, SECURITY_HEADERS);
      })
      .onAfterResponse(({ request, responseValue, set }) => {
        writeRequestLog(request, set.status, responseValue);
      })
      // swagger 1.0.5's .d.ts predates Elysia 1.4's generics (8 positional args,
      // skipLibCheck hides it); letting its return type merge would poison App's
      // route map and break Eden inference in web/expo. It only mutates `app`,
      // so pin the plugin to the empty-schema shape.
      .use(swagger({ path: "/swagger" }) as unknown as (app: Elysia) => Elysia)
      .get("/healthz", () => ({ ok: true }))
      .mount(auth.handler)
      .use(authed(auth))
      .get(
        "/api/protected",
        () => ({ message: "you can see this secret message!" }),
        { auth: true },
      )
      .use(postRoutes(auth, orm))
  );
}
export type App = ReturnType<typeof createApp>;
