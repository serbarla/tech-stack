import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function findWorkspaceRoot(): string {
  let dir = MODULE_DIR;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  // Unreachable in this repo (pnpm-workspace.yaml exists at root); safe fallback.
  return resolve(MODULE_DIR, "../../..");
}

const DEFAULT_DATABASE_URL = "data/sqlite.db";

export function getDatabasePath(): string {
  const raw = process.env.DATABASE_URL;
  const configured =
    raw && raw.trim() !== "" ? raw.trim() : DEFAULT_DATABASE_URL;
  const path = isAbsolute(configured)
    ? configured
    : resolve(findWorkspaceRoot(), configured);
  // Fresh clones have no gitignored data/ dir; node:sqlite fails without it.
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
