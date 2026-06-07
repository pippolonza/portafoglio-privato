const fs = require("node:fs/promises");
const path = require("node:path");

const profilesHandler = require("./api/profiles");
const profileHandler = require("./api/profiles/[id]");
const vaultHandler = require("./api/profiles/[id]/vault");

const ROOT = __dirname;
const BLOCKED = new Set([
  "index.js",
  "local-server.cjs",
  "package.json",
  "vercel.json",
]);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

module.exports = async function handler(request, response) {
  try {
    const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);

    if (url.pathname === "/api/profiles") {
      await profilesHandler(request, response);
      return;
    }

    const profileMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
    if (profileMatch) {
      request.query = { ...(request.query || {}), id: decodeURIComponent(profileMatch[1]) };
      await profileHandler(request, response);
      return;
    }

    const vaultMatch = url.pathname.match(/^\/api\/profiles\/([^/]+)\/vault$/);
    if (vaultMatch) {
      request.query = { ...(request.query || {}), id: decodeURIComponent(vaultMatch[1]) };
      await vaultHandler(request, response);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify({ error: error.message || "Errore interno" }));
  }
};

async function serveStatic(pathname, response) {
  const requested = ["/", "/index", "/index.html", "/index.js"].includes(pathname)
    ? "/index.html"
    : pathname;
  const cleanPath = decodeURIComponent(requested).replace(/^\/+/, "");
  const normalized = path.normalize(cleanPath);
  const filePath = path.join(ROOT, normalized);

  if (
    normalized.startsWith("api" + path.sep) ||
    normalized.startsWith("data" + path.sep) ||
    BLOCKED.has(normalized) ||
    !filePath.startsWith(ROOT)
  ) {
    sendText(response, 404, "File non trovato");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Type", mime[path.extname(filePath)] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.end(data);
  } catch {
    sendText(response, 404, "File non trovato");
  }
}

function sendText(response, status, text) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(text);
}
