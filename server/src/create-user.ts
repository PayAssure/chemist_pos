import "dotenv/config";
import bcrypt from "bcryptjs";
import { initializeDatabase, pool } from "./db";

async function createUser(): Promise<void> {
  const email = process.env.POS_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.POS_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set POS_USER_EMAIL and POS_USER_PASSWORD to provision a user.",
    );
  }
  if (password.length < 12) {
    const databaseUrl = new URL(process.env.DATABASE_URL!);
    const localDatabase = ["localhost", "127.0.0.1", "::1"].includes(
      databaseUrl.hostname,
    );
    if (
      password.length < 8 ||
      process.env.NODE_ENV !== "development" ||
      !localDatabase
    ) {
      throw new Error(
        "Passwords must be at least 12 characters except for local development users, which require at least 8 characters.",
      );
    }
    console.warn("Using a shorter password for a local development account only.");
  }

  try {
    await initializeDatabase();
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2)",
      [email, passwordHash],
    );
    console.log(`Provisioned POS user ${email}`);
  } finally {
    await pool.end();
  }
}

createUser().catch((error: unknown) => {
  console.error("Could not provision POS user:", error);
  process.exitCode = 1;
});
