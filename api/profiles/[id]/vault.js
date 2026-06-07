const { readBody, readProfiles, sendJson, writeProfiles } = require("../../_store");

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "PUT") {
      sendJson(response, 405, { error: "Metodo non supportato" });
      return;
    }

    const body = await readBody(request);
    const profiles = await readProfiles();
    const profile = profiles.find((item) => item.id === request.query.id);

    if (!profile || !body.vault) {
      sendJson(response, 404, { error: "Profilo non trovato" });
      return;
    }

    profile.vault = body.vault;
    profile.updatedAt = new Date().toISOString();
    await writeProfiles(profiles);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Errore interno" });
  }
};
