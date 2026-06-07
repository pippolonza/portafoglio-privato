const fs = require("node:fs/promises");
const path = require("node:path");

const KEY = "portafoglio-privato:profiles";
const DATA_FILE = path.join(process.cwd(), "data", "profiles.json");
const PUBLIC_PROFILE_ID = "public";

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

async function redisCommand(command) {
  const { url, token } = redisConfig();
  if (!url || !token) return null;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Redis error ${response.status}`);
  }

  const payload = await response.json();
  return payload.result;
}

async function readProfiles() {
  const remote = await redisCommand(["GET", KEY]);
  let profiles = null;
  if (remote !== null) {
    profiles = typeof remote === "string" ? JSON.parse(remote) : remote;
  } else {
    try {
      profiles = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    } catch {
      profiles = [];
    }
  }

  if (!profiles.some((profile) => profile.id === PUBLIC_PROFILE_ID)) {
    const publicProfile = {
      id: PUBLIC_PROFILE_ID,
      name: "Pubblico",
      public: true,
      vault: { public: true, cards: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    profiles.unshift(publicProfile);
    await writeProfiles(profiles);
  }

  return profiles;
}

async function writeProfiles(profiles) {
  const written = await redisCommand(["SET", KEY, JSON.stringify(profiles)]);
  if (written !== null) return;

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(profiles, null, 2));
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (request.body && typeof request.body === "object") {
    return Promise.resolve(request.body);
  }

  if (typeof request.body === "string") {
    return Promise.resolve(JSON.parse(request.body || "{}"));
  }

  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error("Dati troppo grandi"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON non valido"));
      }
    });
    request.on("error", reject);
  });
}

module.exports = {
  readBody,
  readProfiles,
  sendJson,
  writeProfiles,
};
