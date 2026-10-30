import type { SqlEntityManager } from "@mikro-orm/sql";
import { MikroORM, NodeSqliteDialect, SqliteDriver } from "@mikro-orm/sql";

import { getDatabasePath } from "./db-path";
import { Post } from "./entities/post";
import { SQLITE_PRAGMA_STATEMENTS } from "./pragmas";

export type Orm = MikroORM<
  SqliteDriver,
  SqlEntityManager<SqliteDriver>,
  [typeof Post]
>;

let orm: Orm | undefined;

export async function initDb(): Promise<Orm> {
  const path = getDatabasePath();
  orm = await MikroORM.init<
    SqliteDriver,
    SqlEntityManager<SqliteDriver>,
    [typeof Post]
  >({
    driver: SqliteDriver,
    driverOptions: new NodeSqliteDialect(path),
    entities: [Post],
    dbName: path,
  });
  for (const statement of SQLITE_PRAGMA_STATEMENTS) {
    await orm.em.getConnection().execute(statement);
  }
  return orm;
}

export function getOrm(): Orm {
  if (!orm) throw new Error("DB not initialized — call initDb() first");
  return orm;
}

export function getKysely() {
  return getOrm().em.getKysely();
}

export { getDatabasePath } from "./db-path";
export { Post };
export { SQLITE_PRAGMA_STATEMENTS } from "./pragmas";
