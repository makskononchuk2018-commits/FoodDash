// db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { PoolConfig } from "pg";
import * as schema from "@shared/schema"; // схема твоих таблиц

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

export const databaseConfigError = databaseUrl
  ? null
  : new Error(
      "DATABASE_URL must be set in .env. Did you forget to provision a database?",
    );

function shouldUseNoVerifySslMode(connectionString: string) {
  const parsedDatabaseUrl = new URL(connectionString);
  const sslMode = parsedDatabaseUrl.searchParams.get("sslmode");
  const sslRejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;

  if (sslRejectUnauthorized?.toLowerCase() === "false") {
    return true;
  }

  return process.env.NODE_ENV !== "production" && sslMode === "require";
}

function setNoVerifySslMode(connectionString: string) {
  const parsedDatabaseUrl = new URL(connectionString);
  parsedDatabaseUrl.searchParams.set("sslmode", "no-verify");
  return parsedDatabaseUrl.toString();
}

function createPoolConfig(connectionString?: string): PoolConfig {
  if (!connectionString) {
    return {};
  }

  return {
    connectionString: shouldUseNoVerifySslMode(connectionString)
      ? setNoVerifySslMode(connectionString)
      : connectionString,
  };
}

const poolConfig = createPoolConfig(databaseUrl);

// Создаём пул соединений к PostgreSQL
export const pool = new Pool(poolConfig);

// Создаём объект Drizzle ORM
export const db = drizzle(pool, { schema });