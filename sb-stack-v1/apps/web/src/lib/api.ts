import { treaty } from "@elysiajs/eden";
import { ENV } from "varlock/env";

import type { App } from "@acme/api";

export const getBaseUrl = () => ENV.VITE_API_URL;

export const api = treaty<App>(getBaseUrl(), {
  fetch: { credentials: "include" },
});

/** Response envelope of `GET /posts`, inferred from the treaty client. */
export type PostsResult = Awaited<ReturnType<typeof api.api.posts.get>>;
