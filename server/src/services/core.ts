import type { AppDatabase, AppStatement, SqlValue } from "../database.js";

export interface ServiceContext {
  db: AppDatabase;
  /** Channel manager id of the caller. */
  userId: string;
  now: Date;
}

export type ErrorKind = "bad" | "notFound" | "conflict" | "unprocessable";

/** Expected, user-facing failure. Mapped to a FunctionCallError by the function layer. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly type: string,
    readonly kind: ErrorKind = "bad",
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export const nowIso = (sc: ServiceContext): string => sc.now.toISOString();

export function newId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function queryAll<T>(
  sc: ServiceContext,
  sql: string,
  ...params: SqlValue[]
): Promise<T[]> {
  const { results } = await sc.db
    .prepare(sql)
    .bind(...params)
    .all<T>();
  return results ?? [];
}

export function queryFirst<T>(
  sc: ServiceContext,
  sql: string,
  ...params: SqlValue[]
): Promise<T | null> {
  return sc.db
    .prepare(sql)
    .bind(...params)
    .first<T>();
}

/** Runs a write and returns the number of changed rows. */
export async function exec(
  sc: ServiceContext,
  sql: string,
  ...params: SqlValue[]
): Promise<number> {
  const result = await sc.db
    .prepare(sql)
    .bind(...params)
    .run();
  return result.meta?.changes ?? 0;
}

export function stmt(
  sc: ServiceContext,
  sql: string,
  ...params: SqlValue[]
): AppStatement {
  return sc.db.prepare(sql).bind(...params);
}

/** Stable, deterministic 32-bit hash used for repeatable "random" picks. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
