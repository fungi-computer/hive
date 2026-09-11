import type { DatabaseSync } from "node:sqlite";
import type { RegionSqliteOwner } from "./index.ts";
/** Types for the existing Node SQLite fixture; not a Cloudflare host. */
export function sqliteTestOwner(db: DatabaseSync, afterExecute?: (statement: string) => void): RegionSqliteOwner;
