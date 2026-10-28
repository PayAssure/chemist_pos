import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initializeDatabase(): Promise<void> {
  const schema = await readFile(path.resolve(__dirname, "../schema.sql"), "utf8");
  await pool.query(schema);
}
