import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

/**
 * Singleton SQLite connection + Drizzle ORM client.
 *
 * The SQLite file lives under ./data/localforge.db (configurable via
 * LOCALFORGE_DB_PATH). The data/ directory is created on first run so that
 * the server can start with no manual filesystem setup.
 *
 * Feature 0 (Database connection established) and Feature 2 (Data persists
 * across server restart) depend on this module using a persistent file-backed
 * database - never in-memory or globalThis-based storage.
 */

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "localforge.db");
const DB_PATH = process.env.LOCALFORGE_DB_PATH || DEFAULT_DB_PATH;

// Lazy singleton — do NOT open the database at module evaluation time so that
// Next.js can import this module during the build step without a real SQLite
// file being present.
let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getSqlite(): Database.Database {
  if (!_sqlite) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _sqlite = new Database(DB_PATH);
    _sqlite.pragma("journal_mode = WAL");
    _sqlite.pragma("foreign_keys = ON");

    if (
      process.env.LOCALFORGE_LOG_DB_CONNECT === "1" ||
      process.env.LOCALFORGE_LOG_DB_CONNECT === "true"
    ) {
      // eslint-disable-next-line no-console
      console.log(`[localforge] SQLite connected: ${DB_PATH}`);
    }
  }
  return _sqlite;
}

function getDb() {
  if (!_db) {
    const shouldLogSql =
      process.env.LOCALFORGE_LOG_SQL === "1" ||
      process.env.LOCALFORGE_LOG_SQL === "true";

    _db = drizzle(getSqlite(), { schema, logger: shouldLogSql });
    migrate(_db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  }
  return _db;
}

// Proxy object so existing callers can use `db.query...` etc. without changes.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as any)[prop];
  },
});

export const sqlite = new Proxy({} as Database.Database, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getSqlite() as any)[prop];
  },
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    getSqlite().prepare("SELECT 1").get();
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[localforge] DB health check failed:", err);
    return false;
  }
}
