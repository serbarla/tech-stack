import type { RouteDefinition, RouteProps } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { query } from "@solidjs/router";
import { createMemo, isPending } from "solid-js";

import users from "../../lib/users.json";
import { paths } from "../../router";

interface UserRecord {
  name: string;
  title: string;
}
const userRecords = users as Record<string, UserRecord | undefined>;

// Async data loading: a query (cached per key) read through a memo — the
// surrounding <Loading> boundary (in App.tsx) shows its fallback until the
// promise settles. The data is a local JSON module here; swap the body for
// any API call — an absolute URL, or a server function (see the `fullstack`
// template). Avoid fetching your own origin during SSR: behind a proxy the
// incoming Host header rarely routes back to this server.
const getUser = query((id: string) => {
  return Promise.resolve(
    userRecords[id] ?? {
      name: "Unknown",
      title: "No such user",
    },
  );
}, "user");

// Starts the fetch as soon as navigation begins, before the page renders.
export const route = {
  preload: ({ params }) => void getUser(params.id ?? ""),
} satisfies RouteDefinition;

export default function User(props: RouteProps<"/users/:id">) {
  const user = createMemo(() => getUser(props.params.id));
  // "Next" only when the id is numeric and the next user exists — a
  // non-numeric id must not emit href "NaN", and the last user must not
  // dead-end on a missing page.
  const nextId = Number(props.params.id) + 1;
  const hasNext =
    Number.isInteger(Number(props.params.id)) &&
    Boolean(userRecords[String(nextId)]);

  return (
    <section style={{ opacity: isPending(user) ? 0.5 : 1 }}>
      <Title>{`User ${props.params.id} - SB Stack`}</Title>
      <h2>{user().name}</h2>
      <p>{user().title}</p>
      {hasNext && (
        <p>
          <a href={paths.users(nextId)}>Next user</a>
        </p>
      )}
    </section>
  );
}
