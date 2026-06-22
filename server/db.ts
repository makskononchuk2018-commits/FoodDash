// db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema"; // схема твоих таблиц

const { Pool } = pg;

// Проверяем, что DATABASE_URL задана
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set in .env. Did you forget to provision a database?"
  );
}

// Создаём пул соединений к PostgreSQL
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Проверка соединения сразу при старте
pool
  .query("SELECT 1")
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => {
    console.error("❌ PostgreSQL connection error:", err);
    process.exit(1); // прекращаем работу приложения, если не удалось подключиться
  });

// Создаём объект Drizzle ORM
export const db = drizzle(pool, { schema });