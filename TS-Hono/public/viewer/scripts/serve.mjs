import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const port = Number(process.env.PORT || 3000);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".fit": "application/octet-stream",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    const file = path.join(root, p);
    if (!file.startsWith(root)) {
      res.writeHead(403).end("403");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 - " + p);
        return;
      }
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  })
  .listen(port, () => {
    console.log(`FIT File Viewer serving ${root}`);
    console.log(`Open http://localhost:${port}/  (Ctrl+C to stop)`);
  });