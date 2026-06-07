const http = require("node:http");
const handler = require("./index");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const server = http.createServer((request, response) => {
  handler(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Portafoglio privato pronto su http://${HOST}:${PORT}`);
});
