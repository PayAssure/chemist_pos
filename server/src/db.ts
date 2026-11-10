import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initializeDatabase(): Promise<void> {
  const schemaDirectory = process.env.NETLIFY
    ? path.resolve(process.cwd(), "dist/server/schema")
    : path.resolve(__dirname, "../schema");
  const schemaFiles = (await readdir(schemaDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (!schemaFiles.length) {
    throw new Error(`No database schema files found in ${schemaDirectory}`);
  }
  const schema = (
    await Promise.all(
      schemaFiles.map((file) =>
        readFile(path.join(schemaDirectory, file), "utf8"),
      ),
    )
  ).join("\n");
  await pool.query(schema);
}
