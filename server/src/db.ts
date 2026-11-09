import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initializeDatabase(): Promise<void> {
  const schemaPath = process.env.NETLIFY
    ? path.resolve(process.cwd(), "dist/server/schema.sql")
    : path.resolve(__dirname, "../schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
}
