import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type {
  AppDatabase,
  AppRunResult,
  AppStatement,
  SqlValue,
} from "../database.js";

const migrationsDir = new URL(
  "../../../cloudflare/migrations/",
  import.meta.url,
);

class SqliteStatement implements AppStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly params: SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): AppStatement {
    return new SqliteStatement(this.sqlite, this.sql, values);
  }

  run(): Promise<AppRunResult> {
    const result = this.sqlite.prepare(this.sql).run(...this.params);
    return Promise.resolve({ meta: { changes: Number(result.changes) } });
  }

  first<T>(): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.params);
    return Promise.resolve((row as T | undefined) ?? null);
  }

  all<T>(): Promise<{ results: T[] }> {
    const rows = this.sqlite.prepare(this.sql).all(...this.params);
    return Promise.resolve({ results: rows as T[] });
  }
}

/** In-memory SQLite with every migration applied, exposed through the D1-shaped contract. */
export function createTestDatabase(): AppDatabase {
  const sqlite = new DatabaseSync(":memory:");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files)
    sqlite.exec(readFileSync(new URL(file, migrationsDir), "utf8"));

  return {
    prepare: (sql) => new SqliteStatement(sqlite, sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results: AppRunResult[] = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
