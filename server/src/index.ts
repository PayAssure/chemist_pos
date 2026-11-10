import "dotenv/config";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import path from "node:path";
import { initializeDatabase, pool } from "./db";
import routes from "./routes";

const app = express();
const PgSession = connectPgSimple(session);
const port = Number(process.env.PORT ?? 3000);
const sessionSecret = process.env.SESSION_SECRET;

app.use("/webhook", express.raw({ type: "application/json", limit: "64kb" }));

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must be set to at least 32 characters");
}

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use(session({
  store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  secret: sessionSecret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(routes);

if (process.env.NODE_ENV === "production" && !process.env.NETLIFY) {
  const webDirectory = path.resolve(__dirname, "../../../web/dist");
  app.use(express.static(webDirectory));
  app.get("*", (_req, res) => res.sendFile(path.join(webDirectory, "index.html")));
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Request failed:", error);
  res.status(500).json({ error: "An unexpected server error occurred" });
});

let databaseInitialization: Promise<void> | undefined;
export function ensureDatabaseInitialized(): Promise<void> {
  databaseInitialization ??= initializeDatabase();
  return databaseInitialization;
}
export { app };

if (require.main === module) {
  ensureDatabaseInitialized()
    .then(() => { app.listen(port, () => console.log("POS server listening on port " + port)); })
    .catch((error: unknown) => {
      console.error("Could not initialize the database:", error);
      process.exitCode = 1;
    });
}
