import { Elysia } from "elysia";

import { writeRequestLog } from "./logger";
import { SECURITY_HEADERS } from "./security";

// In-memory fixed-window limiter for the better-auth routes only.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const buckets = new Map<string, { count: number; resetAt: number }>();

export const authRateLimit = new Elysia({ name: "rate-limit" }).onRequest(
  ({ request, server }) => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/auth/")) return;

    const now = Date.now();
    if (buckets.size > 1024) {
      for (const [key, bucket] of buckets) {
        if (now >= bucket.resetAt) buckets.delete(key);
      }
    }

    const forwarded = request.headers
      .get("x-forwarded-for")
      ?.split(",")
      .map((entry) => entry.trim())
      .find((entry) => entry !== "");
    const ip = forwarded ?? server?.requestIP(request)?.address ?? "unknown";

    let bucket = buckets.get(ip);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(ip, bucket);
    }
    if (++bucket.count > MAX_REQUESTS) {
      // Early return skips the response pipeline, so log the block here.
      writeRequestLog(request, 429);
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "content-type": "application/json", ...SECURITY_HEADERS },
      });
    }
  },
);
