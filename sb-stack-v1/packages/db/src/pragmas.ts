/**
 * Single owner of SQLite connection config.
 *
 * `journal_mode` is persistent (stored in the DB file), everything else is
 * per-connection, so every connection must run the full list. `synchronous =
 * FULL` is a deliberate durability choice: a crash may never lose an
 * acknowledged write, and it is pinned explicitly — never below FULL.
 */
export const SQLITE_PRAGMA_STATEMENTS = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = FULL",
  "PRAGMA busy_timeout = 5000",
  "PRAGMA mmap_size = 536870912",
  "PRAGMA cache_size = -65536",
  "PRAGMA temp_store = MEMORY",
] as const;
