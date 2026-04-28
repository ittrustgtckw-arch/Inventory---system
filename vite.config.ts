import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";

/** Same port the API uses from `.env` (Vite must not use a stale shell `PORT=` from the parent process). */
function readApiPortFromProjectDotenv(cwd: string): string | null {
  const envPath = path.join(cwd, ".env");
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    const m = raw.match(/^PORT\s*=\s*(\d+)\s*$/m);
    if (m?.[1]) return m[1].trim();
  } catch {
    /* missing or unreadable */
  }
  return null;
}

/** Warn in the terminal if the Express API is not up (otherwise /api/* proxies as HTTP 500 in the browser). */
function apiReachablePlugin(apiPort: string): Plugin {
  return {
    name: "crane-api-reachable",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        // Defer one tick so the API sibling process is reliably accepting TCP (wait-on already passed, but this avoids races).
        setImmediate(() => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port: apiPort,
              path: "/api/health",
              method: "GET",
            },
            (res) => {
              if (res.statusCode !== 200) {
                server.config.logger.warn(
                  `\n[crane] API on 127.0.0.1:${apiPort} returned HTTP ${res.statusCode}. Start it: npm run server (or npm run dev:all).\n`
                );
              }
              res.resume();
            }
          );
          req.setTimeout(8000, () => {
            req.destroy();
            server.config.logger.warn(`\n[crane] API health check timed out (127.0.0.1:${apiPort}).\n`);
          });
          req.on("error", () => {
            server.config.logger.warn(
              `\n[crane] Cannot reach API at http://127.0.0.1:${apiPort} — /api/* will fail in the browser.\n` +
                `    Fix: run \`npm run server\` in another terminal, or \`npm run dev:all\` here.\n`
            );
          });
          req.end();
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const rootDir = process.cwd();
  const env = loadEnv(mode, rootDir, "");
  const apiPort = readApiPortFromProjectDotenv(rootDir) || String(env.PORT || "3001").trim() || "3001";
  // Use IPv4 loopback so the proxy does not hit Windows "localhost" → ::1 first and get ECONNREFUSED
  // while the API is only reachable on 127.0.0.1 (shows as 500 in the browser).
  const target = `http://127.0.0.1:${apiPort}`;
  const apiProxy = {
    "/api": { target, changeOrigin: true },
    "/uploads": { target, changeOrigin: true },
  } as const;

  return {
    plugins: [react(), apiReachablePlugin(apiPort)],
    // One physical React copy (invalid hook call / useContext null when Vite prebundles mixed paths).
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        react: path.resolve(rootDir, "node_modules/react"),
        "react-dom": path.resolve(rootDir, "node_modules/react-dom"),
      },
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react-router-dom",
        "react-i18next",
        "i18next",
      ],
    },
    server: {
      port: 5173,
      // Do not set `server.hmr.port` without the real listen port: if 5173 is busy Vite uses 5174+
      // and a mismatched HMR URL breaks the websocket and can corrupt the client bundle.
      proxy: { ...apiProxy },
    },
    preview: {
      port: 5173,
      proxy: { ...apiProxy },
    },
  };
});

