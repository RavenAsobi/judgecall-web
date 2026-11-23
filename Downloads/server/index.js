"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3001);
const SITE_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(process.env.DOWNLOAD_DATA_DIR || path.join(__dirname, "data"));
const COUNTS_FILE = path.join(DATA_DIR, "counts.json");
const DEFAULT_COUNTS = { judgecallApp: 0, lynxExtension: 0, ratheDict: 0, streamingTome: 0 };
const DOWNLOADS = {
  judgecall: { key: "judgecallApp", file: "JudgeCall v2.2.apk" },
  "rathe-dict": { key: "ratheDict", file: "Rathe-Dict-v3.0.3.apk" },
  "streaming-tome": { key: "streamingTome", file: "Streaming Tome v1.2 beta.exe" },
  "lynx-extension": { key: "lynxExtension", file: "Lynx v1.0.1.zip" },
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".apk": "application/vnd.android.package-archive",
  ".rar": "application/vnd.rar",
  ".zip": "application/zip",
  ".exe": "application/vnd.microsoft.portable-executable",
};

function loadCounts() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const saved = JSON.parse(fs.readFileSync(COUNTS_FILE, "utf8"));
    return Object.fromEntries(
      Object.entries(DEFAULT_COUNTS).map(([key, fallback]) => [
        key,
        Number.isSafeInteger(saved[key]) && saved[key] >= 0 ? saved[key] : fallback,
      ]),
    );
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Unable to read download counts:", error);
    return { ...DEFAULT_COUNTS };
  }
}

let counts = loadCounts();

function saveCounts() {
  const temporaryFile = `${COUNTS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(counts, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryFile, COUNTS_FILE);
}

function sendJson(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (decodedPath === "/") decodedPath = "/index.html";
  const filePath = path.resolve(SITE_ROOT, `.${decodedPath}`);
  const allowedRoot = `${SITE_ROOT}${path.sep}`;
  const relativePath = path.relative(SITE_ROOT, filePath).replaceAll("\\", "/");

  if (
    !filePath.startsWith(allowedRoot) ||
    relativePath.startsWith("server/") ||
    relativePath.startsWith("deploy/") ||
    relativePath.split("/").some((segment) => segment.startsWith("."))
  ) {
    response.writeHead(404).end("Not found");
    return;
  }

  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    response.writeHead(404).end("Not found");
    return;
  }
  if (!stats.isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Content-Length": stats.size,
  };
  if (decodedPath.startsWith("/files/")) {
    headers["Content-Disposition"] = `attachment; filename="${path.basename(filePath)}"`;
  }
  response.writeHead(200, headers);
  if (request.method === "HEAD") response.end();
  else fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  if (!request.url || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/api/counts") {
    sendJson(response, 200, counts);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/download/")) {
    const slug = url.pathname.slice("/download/".length);
    const download = DOWNLOADS[slug];
    if (!download || !fs.existsSync(path.join(SITE_ROOT, "files", download.file))) {
      sendJson(response, 404, { error: "Download not found" });
      return;
    }

    counts = { ...counts, [download.key]: counts[download.key] + 1 };
    try {
      saveCounts();
    } catch (error) {
      console.error("Unable to save download counts:", error);
      sendJson(response, 503, { error: "Download counter unavailable" });
      return;
    }

    response.writeHead(302, {
      Location: `/files/${encodeURIComponent(download.file)}`,
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  serveStatic(request, response, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`JudgeCall download service listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
