import { defineConfig, NodeSqliteDialect, SqliteDriver } from "@mikro-orm/sql";

import { getDatabasePath } from "./src/db-path";
import { Post } from "./src/entities/post";

export default defineConfig({
  driver: SqliteDriver,
  driverOptions: () => new NodeSqliteDialect(getDatabasePath()),
  entities: [Post],
  dbName: getDatabasePath(),
  migrations: { path: "./src/migrations", pathTs: "./src/migrations" },
});
