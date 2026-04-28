/**
 * Checks that GET /api/users exists on your local API (not 404).
 * Expects the API already running (e.g. npm run server or npm run dev:all).
 *
 * Port: env PORT, else first PORT= line in .env, else 3001 (same as Vite proxy).
 *
 * Run: npm run test:api-users
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

/* Prefer .env PORT so this matches `node server/index.js` (dotenv override), not a stale shell PORT. */
const port = readPortFromDotenv() || String(process.env.PORT || "3001").trim();

function httpGet(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method: "GET", timeout: 8000 },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

(async () => {
  console.log(`[test:api-users] Probing http://127.0.0.1:${port}/api/users (API must be running)`);

  let status;
  try {
    const r = await httpGet("/api/users");
    status = r.status;
  } catch (e) {
    console.error("[test:api-users] FAIL: cannot connect — start the API first, then Vite:");
    console.error('  npm run dev:all');
    console.error("  (or two terminals: npm run server  +  npm run dev)");
    console.error("  Error:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  if (status === 404) {
    console.error("[test:api-users] FAIL: GET /api/users returned 404.");
    console.error("  Another process may be on port", port, "without this route — stop old Node servers and restart:");
    console.error("  npm run server");
    process.exit(1);
  }

  if (status === 403) {
    console.log("[test:api-users] OK: 403 Forbidden without token (route exists; log in as manager in the app).");
    process.exit(0);
  }

  if (status === 200) {
    console.log("[test:api-users] OK: 200 (token was not required for this response — unusual but route exists).");
    process.exit(0);
  }

  console.log("[test:api-users] Unexpected status:", status, "(route is not 404; check response body if issues persist)");
  process.exit(0);
})();
