import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const cssUrl = new URL("../app/globals.tech.css", import.meta.url);

test("header section navigation uses one explicit viewport scroll", async () => {
  const page = await readFile(pageUrl, "utf8");
  assert.match(page, /handleHeaderNavigation/);
  assert.match(page, /event\.preventDefault\(\)/);
  assert.match(page, /window\.scrollTo\(\{ top, behavior: "auto" \}\)/);
  assert.match(page, /window\.history\.pushState\(null, "", href\)/);
});

test("section jumps do not trigger deferred layout or a nested timer scroller", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.doesNotMatch(css, /content-visibility\s*:/);
  assert.doesNotMatch(css, /contain-intrinsic-block-size\s*:/);
  const timerStage = css.match(/\.timer-stage\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(timerStage, /overflow:\s*hidden/);
  assert.doesNotMatch(timerStage, /overflow:\s*auto/);
});