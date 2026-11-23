import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const vinextCli = resolve(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const legalRoot = resolve(projectRoot, "..", "Legal_Docs");
const generatedLegalPath = resolve(projectRoot, "app", "generated-legal-content.ts");

const legalContent = {
  copyright: await readFile(resolve(legalRoot, "CopyRights.md"), "utf8"),
  terms: await readFile(resolve(legalRoot, "服务条款.md"), "utf8"),
  privacy: await readFile(resolve(legalRoot, "隐私政策.md"), "utf8"),
};
await writeFile(
  generatedLegalPath,
  `// Generated from ../Legal_Docs by scripts/build-tencent.mjs.\nexport const COPYRIGHT_TEXT = ${JSON.stringify(legalContent.copyright)};\nexport const TERMS_MARKDOWN = ${JSON.stringify(legalContent.terms)};\nexport const PRIVACY_MARKDOWN = ${JSON.stringify(legalContent.privacy)};\n`,
  "utf8",
);
const env = {
  ...process.env,
  WRANGLER_LOG_PATH: resolve(projectRoot, ".wrangler", "wrangler.log"),
};
const result = spawnSync(process.execPath, [vinextCli, "build"], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);
await import("./export-tencent-static.mjs");