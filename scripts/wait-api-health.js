/**
 * Blocks until GET /api/health returns 200 on 127.0.0.1 (same PORT resolution as Vite proxy).
 * Used by npm run dev:all so Vite does not start before the API is listening.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");

function readPortFromDotenv() {
  try {
    const raw = fs.readFileSync(path.join(root, ".env"), "utf8");
    const m = raw.match(/^PORT\s*=\s*(\d+)\s*$/m);
    if (m) return String(m[1]).trim();
  } catch {
    /* no .env */
  }
  return null;
}

const port = readPortFromDotenv() || String(process.env.PORT || "3001").trim();
const maxMs = 120_000;
const intervalMs = 400;

function ping() {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: "/api/health", method: "GET", timeout: 3000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function main() {
  const url = `http://127.0.0.1:${port}/api/health`;
  process.stderr.write(`[dev:all] waiting for API ${url} …\n`);
  const start = Date.now();
  for (;;) {
    if (await ping()) {
      process.stderr.write(`[dev:all] API is up on port ${port}.\n`);
      process.exit(0);
    }
    if (Date.now() - start > maxMs) {
      process.stderr.write(
        `[dev:all] Timed out after ${maxMs / 1000}s — API never answered on port ${port}.\n` +
          `  Check: MongoDB / .env, run \`npm run server\` alone and read errors.\n` +
          `  If API uses another port, set PORT= in .env to match.\n`
      );
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main();
