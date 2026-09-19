import { AsyncLocalStorage } from "node:async_hooks";

export type SqlValue = string | number | null;

export interface AppRunResult {
  meta?: { changes?: number };
}

export interface AppStatement {
  bind(...values: SqlValue[]): AppStatement;
  run(): Promise<AppRunResult>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

// A small shared contract keeps local Node development independent of Workers types.
// Cloudflare D1 satisfies it structurally; tests use an in-memory SQLite adapter.
export interface AppDatabase {
  prepare(sql: string): AppStatement;
  batch(statements: AppStatement[]): Promise<AppRunResult[]>;
}
const databaseContext = new AsyncLocalStorage<AppDatabase>();
export function withDatabase<T>(database: AppDatabase, callback: () => T): T {
  return databaseContext.run(database, callback);
}
export function getDatabase(): AppDatabase {
  const database = databaseContext.getStore();
  if (!database)
    throw new Error(
      "D1 requires the Cloudflare runtime; use pnpm dev:cloudflare",
    );
  return database;
}
