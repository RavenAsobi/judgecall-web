import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const clientRoot = join(projectRoot, "dist", "client");
const workerPath = join(projectRoot, "dist", "server", "index.js");
const outputRoot = join(projectRoot, "dist-tencent");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".woff2": "font/woff2",
};

function safeAssetPath(url) {
  const decoded = decodeURIComponent(new URL(url).pathname);
  const relative = decoded.replace(/^\/+/, "");
  const resolved = resolve(clientRoot, relative);
  const normalizedRoot = clientRoot.replaceAll("\\", "/");
  const normalizedPath = resolved.replaceAll("\\", "/");
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`Unsafe asset path: ${decoded}`);
  }
  return resolved;
}

async function assetResponse(request) {
  try {
    const file = safeAssetPath(request.url);
    const info = await stat(file);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    return new Response(await readFile(file), {
      headers: { "content-type": contentTypes[extname(file).toLowerCase()] || "application/octet-stream" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function main() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await cp(clientRoot, outputRoot, { recursive: true });

  const workerUrl = pathToFileURL(workerPath);
  workerUrl.searchParams.set("static-export", `${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://judgecall.net/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: assetResponse } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  if (!response.ok) {
    throw new Error(`JudgeCall render failed: ${response.status} ${await response.text()}`);
  }

  const localFontRoot = `${projectRoot.replaceAll("\\", "/")}/.vinext/fonts/`;
  const html = (await response.text()).replaceAll(localFontRoot, "/assets/_vinext_fonts/");
  if (!html.includes("JudgeCall") || !html.includes("https://lynx.judgecall.net/")) {
    throw new Error("Rendered homepage is missing JudgeCall or the Lynx public URL.");
  }
  await writeFile(join(outputRoot, "index.html"), html, "utf8");
  console.log(`Tencent static export written to ${outputRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});