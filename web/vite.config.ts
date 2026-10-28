import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, "PORT");
  const apiPort = process.env.PORT ?? env.PORT ?? "3000";

  return {
    root: webRoot,
    envDir: projectRoot,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": `http://localhost:${apiPort}` },
    },
  };
});
