const { readFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { join } = require("node:path");

const files = new Map([
  ["/index.html", "text/html; charset=utf-8"],
  ["/guest.html", "text/html; charset=utf-8"],
  ["/dashboard.html", "text/html; charset=utf-8"],
  ["/guest.js", "text/javascript; charset=utf-8"],
  ["/dashboard.js", "text/javascript; charset=utf-8"],
  ["/demo.js", "text/javascript; charset=utf-8"],
  ["/assets/golos-400.ttf", "font/ttf"],
  ["/assets/golos-900.ttf", "font/ttf"],
]);
const port = Number(process.env.CONCIERGE_DEMO_PORT || 4174);

createServer(async (req, res) => {
  const path = req.url?.split("?")[0];
  const file = path === "/" ? "/index.html" : path;
  if (!files.has(file) || !["GET", "HEAD"].includes(req.method)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(join(__dirname, file));
    res.writeHead(200, { "Content-Type": files.get(file), "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => {
  console.log("Демо открыто на http://127.0.0.1:" + port);
});
