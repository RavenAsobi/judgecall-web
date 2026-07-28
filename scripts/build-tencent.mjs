import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const vinextCli = resolve(projectRoot, "node_modules", "vinext", "dist", "cli.js");
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