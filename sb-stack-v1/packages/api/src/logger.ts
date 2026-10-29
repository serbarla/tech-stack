// One line per response: method, path, status, duration. Off under `bun test`.
const enabled = process.env.NODE_ENV !== "test";
const startedAt = new WeakMap<Request, number>();

export function startRequestLog(request: Request) {
  if (enabled) startedAt.set(request, performance.now());
}

// `responseValue` wins over `status` when the handler already produced a
// Response (e.g. the mounted better-auth handler), since `set.status` then
// still reads the 200 default.
export function writeRequestLog(
  request: Request,
  status: number | string | undefined,
  responseValue?: unknown,
) {
  if (!enabled) return;
  const code =
    responseValue instanceof Response ? responseValue.status : (status ?? 200);
  const start = startedAt.get(request);
  const duration =
    start === undefined ? 0 : Math.round(performance.now() - start);
  console.log(
    `${request.method} ${new URL(request.url).pathname} ${code} ${duration}ms`,
  );
}
