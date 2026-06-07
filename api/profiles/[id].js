const { readProfiles, sendJson } = require("../_store");

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Metodo non supportato" });
      return;
    }

    const profile = (await readProfiles()).find((item) => item.id === request.query.id);
    if (!profile) {
      sendJson(response, 404, { error: "Profilo non trovato" });
      return;
    }

    sendJson(response, 200, profile);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Errore interno" });
  }
};
