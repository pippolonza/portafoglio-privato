const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(ROOT, "data", "profiles.json");
const DATA_DIR = path.dirname(DATA_FILE);
const MAX_BODY = 25 * 1024 * 1024;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }
    await serveStatic(request, response);
  } catch (error) {
    send(response, 500, { error: error.message || "Errore interno" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Portafoglio privato pronto su http://${HOST}:${PORT}`);
});

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/profiles") {
    const profiles = await readProfiles();
    send(response, 200, profiles.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt })));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/profiles") {
    const body = await readJson(request);
    if (!body.name || !body.salt || !body.vault) {
      send(response, 400, { error: "Profilo incompleto" });
      return;
    }

    const profiles = await readProfiles();
    if (profiles.some((profile) => profile.name.toLowerCase() === body.name.trim().toLowerCase())) {
      send(response, 409, { error: "Nome profilo gia presente" });
      return;
    }

    const now = new Date().toISOString();
    const profile = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      salt: body.salt,
      vault: body.vault,
      createdAt: now,
      updatedAt: now,
    };
    profiles.push(profile);
    await writeProfiles(profiles);
    send(response, 201, profile);
    return;
  }

  if (request.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "profiles") {
    const profile = (await readProfiles()).find((item) => item.id === parts[2]);
    if (!profile) {
      send(response, 404, { error: "Profilo non trovato" });
      return;
    }
    send(response, 200, profile);
    return;
  }

  if (request.method === "PUT" && parts.length === 4 && parts[0] === "api" && parts[1] === "profiles" && parts[3] === "vault") {
    const body = await readJson(request);
    const profiles = await readProfiles();
    const profile = profiles.find((item) => item.id === parts[2]);
    if (!profile || !body.vault) {
      send(response, 404, { error: "Profilo non trovato" });
      return;
    }
    profile.vault = body.vault;
    profile.updatedAt = new Date().toISOString();
    await writeProfiles(profiles);
    send(response, 200, { ok: true });
    return;
  }

  send(response, 404, { error: "API non trovata" });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const cleanPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, cleanPath));

  if (!filePath.startsWith(ROOT) || filePath.startsWith(DATA_DIR)) {
    sendText(response, 403, "Accesso negato");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  } catch {
    sendText(response, 404, "File non trovato");
  }
}

async function readProfiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch {
    await writeProfiles([]);
    return [];
  }
}

async function writeProfiles(profiles) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(profiles, null, 2));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        request.destroy();
        reject(new Error("Dati troppo grandi"));
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("JSON non valido"));
      }
    });
    request.on("error", reject);
  });
}

function send(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}
