import "dotenv/config";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
if (!sourceUrl) {
  throw new Error(
    "Set SOURCE_DATABASE_URL in .env to the existing POS PostgreSQL database after verifying it is not the Settlement Engine database.",
  );
}

let source;
try {
  source = new URL(sourceUrl);
} catch {
  throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
}
if (!["postgres:", "postgresql:"].includes(source.protocol)) {
  throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
}

const sourceEnvironment = {
  ...process.env,
  PGHOST: source.hostname.replace(/^\[|\]$/g, ""),
  PGPORT: source.port || "5432",
  PGDATABASE: decodeURIComponent(source.pathname.slice(1)),
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
};
for (const [key, value] of source.searchParams) {
  const libpqKey = `PG${key.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`;
  sourceEnvironment[libpqKey] = value;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr?.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function runChecked(command, args, options = {}) {
  const result = await run(command, args, options);
  if (result.code !== 0) {
    throw new Error(
      `${command} failed${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`,
    );
  }
  return result.stdout.trim();
}

await runChecked("docker", ["compose", "up", "-d", "db"]);

let databaseReady = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const result = await run("docker", [
    "compose", "exec", "-T", "db", "sh", "-c",
    'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ]);
  if (result.code === 0) {
    databaseReady = true;
    break;
  }
  await delay(1000);
}
if (!databaseReady) {
  throw new Error("Compose PostgreSQL did not become ready within 60 seconds.");
}

const existingObjects = await runChecked("docker", [
  "compose", "exec", "-T", "db", "sh", "-c",
  `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f');"`,
]);
if (Number(existingObjects) !== 0) {
  throw new Error(
    "The Compose database is not empty. Refusing to overwrite it; use a fresh volume or inspect it before migrating.",
  );
}

const dump = spawn("pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-acl",
], {
  env: sourceEnvironment,
  stdio: ["ignore", "pipe", "inherit"],
});
const restore = spawn("docker", [
  "compose", "exec", "-T", "db", "sh", "-c",
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --single-transaction',
], {
  stdio: ["pipe", "inherit", "inherit"],
});

dump.stdout.pipe(restore.stdin);
const dumpExit = new Promise((resolve, reject) => {
  dump.once("error", reject);
  dump.once("close", (code) => resolve(code));
});
const restoreExit = new Promise((resolve, reject) => {
  restore.once("error", reject);
  restore.once("close", (code) => resolve(code));
});
const [dumpCode, restoreCode] = await Promise.all([dumpExit, restoreExit]);
if (dumpCode !== 0 || restoreCode !== 0) {
  throw new Error(
    `Database migration failed (pg_dump exit ${dumpCode}, pg_restore exit ${restoreCode}). Verify the Compose database before retrying.`,
  );
}

console.log("Database schema and records copied to the Compose PostgreSQL volume.");
