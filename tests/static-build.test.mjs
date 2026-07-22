import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("build emits a GitHub Pages-safe relative app shell", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /lang="zh-Hant-TW"/);
  assert.match(html, /\.\/assets\/[^"']+\.js/);
  assert.match(html, /\.\/manifest\.webmanifest/);
  assert.doesNotMatch(html, /\/shut_up\/assets\//);
});

test("build includes PWA offline files and application bundle", async () => {
  const files = await readdir(new URL("../dist", import.meta.url));
  assert.ok(files.includes("sw.js"));
  assert.ok(files.includes("manifest.webmanifest"));
  assert.ok(files.includes("favicon.svg"));
  assert.ok(files.includes("assets"));
  const worker = await readFile(new URL("../dist/sw.js", import.meta.url), "utf8");
  assert.match(worker, /CACHE_NAME/);
  assert.match(worker, /request\.mode === "navigate"/);
});
