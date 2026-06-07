const fs = require("node:fs/promises");
const path = require("node:path");

const profilesHandler = require("./api/profiles");
const profileHandler = require("./api/profiles/[id]");
const vaultHandler = require("./api/profiles/[id]/vault");

const ROOT = __dirname;
const STATIC_FILES = new Set([
  "index.html",
  "client.js",
  "styles.css",
  "icon.svg",
  "favicon.png",
  "manifest.webmanifest",
  "sw.js",
]);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

module.exports = async function handler(request, response) {
  try {
    const url = new URL(request.url || "/", `https://${request.headers.host || "localhost"}`);

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
    sendJson(response, 500, { error: error.message || "Errore interno" });
  }
};

async function serveStatic(pathname, response) {
  const fileName = pathname === "/" || pathname === "/index" || pathname === "/index.js"
    ? "index.html"
    : decodeURIComponent(pathname).replace(/^\/+/, "");

  if (!STATIC_FILES.has(fileName)) {
    sendText(response, 404, "File non trovato");
    return;
  }

  try {
    const filePath = path.join(ROOT, fileName);
    const data = await fs.readFile(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Type", mime[path.extname(filePath)] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.end(data);
  } catch (error) {
    sendText(response, 500, `File statico non incluso nel deploy: ${fileName}`);
  }
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(text);
}
