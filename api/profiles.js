const crypto = require("node:crypto");
const { readBody, readProfiles, sendJson, writeProfiles } = require("./_store");

module.exports = async function handler(request, response) {
  try {
    if (request.method === "GET") {
      const profiles = await readProfiles();
      sendJson(response, 200, profiles.map(({ id, name, createdAt, updatedAt, public: isPublic }) => ({ id, name, createdAt, updatedAt, public: isPublic })));
      return;
    }

    if (request.method === "POST") {
      const body = await readBody(request);
      if (!body.name || !body.vault) {
        sendJson(response, 400, { error: "Profilo incompleto" });
        return;
      }

      const profiles = await readProfiles();
      const name = body.name.trim();
      if (profiles.some((profile) => profile.name.toLowerCase() === name.toLowerCase())) {
        sendJson(response, 409, { error: "Nome profilo gia presente" });
        return;
      }

      const now = new Date().toISOString();
      const profile = {
        id: crypto.randomUUID(),
        name,
        public: Boolean(body.public),
        salt: body.public ? null : body.salt,
        vault: body.vault,
        createdAt: now,
        updatedAt: now,
      };

      profiles.push(profile);
      await writeProfiles(profiles);
      sendJson(response, 201, profile);
      return;
    }

    sendJson(response, 405, { error: "Metodo non supportato" });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Errore interno" });
  }
};
