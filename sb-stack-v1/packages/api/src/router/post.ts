import { wrap } from "@mikro-orm/core";
import { Elysia } from "elysia";

import type { Auth } from "@acme/auth";
import type { Orm } from "@acme/db";
import { Post } from "@acme/db";
import { CreatePostSchema } from "@acme/validators";

import { authed } from "../middleware";

export const postRoutes = (auth: Auth, orm: Orm) =>
  new Elysia()
    .use(authed(auth))
    .get("/api/posts", async () => {
      const kysely = orm.em.getKysely();
      const rows = await kysely
        .selectFrom("post")
        .selectAll()
        .orderBy("created_at", "desc")
        .limit(10)
        .execute();
      // Alias snake_case columns to the entity's key names so list items share
      // the exact key set of wrap(post).toObject() detail/create/delete rows.
      return rows.map(({ created_at, updated_at, ...rest }) => ({
        ...rest,
        createdAt: created_at,
        updatedAt: updated_at,
      }));
    })
    .get("/api/posts/:id", async ({ params: { id }, status }) => {
      const post = await orm.em.fork().findOne(Post, { id });
      return post
        ? wrap(post).toObject()
        : status(404, { error: "Post not found" });
    })
    .post(
      "/api/posts",
      async ({ body }) => {
        // mikro-orm 7 forbids context actions on the global EntityManager — fork per request.
        // p.uuid() has no generator and the DDL has no default, so the route supplies the id.
        const em = orm.em.fork();
        const post = em.create(Post, { ...body, id: crypto.randomUUID() });
        await em.flush();
        return wrap(post).toObject();
      },
      { body: CreatePostSchema, auth: true },
    )
    .delete(
      "/api/posts/:id",
      async ({ params: { id }, status }) => {
        const em = orm.em.fork();
        const post = await em.findOne(Post, { id });
        if (!post) return status(404, { error: "Post not found" });
        const removed = wrap(post).toObject();
        em.remove(post);
        await em.flush();
        return removed;
      },
      { auth: true },
    );
