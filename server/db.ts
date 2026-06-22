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

function shouldTrustSelfSignedCertificate(connectionString: string) {
  const parsedDatabaseUrl = new URL(connectionString);
  const sslMode = parsedDatabaseUrl.searchParams.get("sslmode");
  const sslRejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;

  if (sslRejectUnauthorized?.toLowerCase() === "false") {
    return true;
  }

  return process.env.NODE_ENV !== "production" && sslMode === "require";
}

const poolConfig: PoolConfig = {};

if (databaseUrl) {
  poolConfig.connectionString = databaseUrl;

  if (shouldTrustSelfSignedCertificate(databaseUrl)) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

// Создаём пул соединений к PostgreSQL
export const pool = new Pool(poolConfig);

if (!databaseConfigError) {
  // Проверка соединения сразу при старте
  pool
    .query("SELECT 1")
    .then(() => console.log("✅ Connected to PostgreSQL"))
    .catch((err) => {
      console.error("❌ PostgreSQL connection error:", err);
      process.exit(1); // прекращаем работу приложения, если не удалось подключиться
    });
}

// Создаём объект Drizzle ORM
export const db = drizzle(pool, { schema });