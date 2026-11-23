import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
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
  const localFontRoot = `${projectRoot.replaceAll("\\", "/")}/.vinext/fonts/`;
  const routes = [
    { pathname: "/", output: "index.html", required: ["/cn", "window.location.replace"] },
    { pathname: "/cn", output: join("cn", "index.html"), required: ["让每一场比赛", "https://lynx.judgecall.net/"] },
    { pathname: "/en", output: join("en", "index.html"), required: ["Make every match", "https://lynx.judgecall.net/"] },
    { pathname: "/cn/terms", output: join("cn", "terms", "index.html"), required: ["JudgeCall服务条款", "support@judgecall.net"] },
    { pathname: "/en/terms", output: join("en", "terms", "index.html"), required: ["JudgeCall Terms of Service", "support@judgecall.net"] },
    { pathname: "/cn/privacy", output: join("cn", "privacy", "index.html"), required: ["JudgeCall隐私政策", "support@judgecall.net"] },
    { pathname: "/en/privacy", output: join("en", "privacy", "index.html"), required: ["JudgeCall Privacy Policy", "support@judgecall.net"] },
  ];

  for (const route of routes) {
    const response = await worker.fetch(
      new Request(`https://index.judgecall.net${route.pathname}`, { headers: { accept: "text/html" } }),
      { ASSETS: { fetch: assetResponse } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    if (!response.ok) {
      throw new Error(`JudgeCall render failed for ${route.pathname}: ${response.status} ${await response.text()}`);
    }

    const html = (await response.text())
      .replaceAll(localFontRoot, "/assets/_vinext_fonts/")
      .replaceAll("http://localhost:3000/", "https://index.judgecall.net/")
      .replaceAll("https://index.judgecall.net/lynx.png", "/lynx.png")
      .replaceAll("http:\\\\/\\\\/index.judgecall.net\\\\/lynx.png", "\\\\/lynx.png");
    if (!route.required.every((marker) => html.includes(marker))) {
      throw new Error(`Rendered ${route.pathname} is missing required content.`);
    }
    const outputPath = join(outputRoot, route.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, "utf8");
  }
  console.log(`Tencent static export written to ${outputRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});