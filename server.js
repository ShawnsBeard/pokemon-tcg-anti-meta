import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDeckDetails, getOfficialEvents, getRankings } from "./api/_limitless.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 4173);

async function sendJson(res, data) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

async function sendStatic(res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const file = path.join(publicDir, cleanPath);
  if (!file.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const data = await readFile(file);
  const ext = path.extname(file);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  };
  res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/rankings") {
      await sendJson(res, await getRankings(url.toString()));
      return;
    }

    if (url.pathname === "/api/events") {
      await sendJson(res, await getOfficialEvents(url.toString()));
      return;
    }

    const deckMatch = url.pathname.match(/^\/api\/decks\/([^/]+)$/);
    if (deckMatch) {
      await sendJson(res, await getDeckDetails(deckMatch[1], url.toString()));
      return;
    }

    await sendStatic(res, url.pathname);
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }, null, 2));
  }
});

server.listen(PORT, () => {
  console.log(`Pokemon TCG Anti Meta running at http://localhost:${PORT}`);
});
