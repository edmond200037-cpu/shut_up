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

test("build includes shared category and audio marker workflow", async () => {
  const assetDir = new URL("../dist/assets/", import.meta.url);
  const files = await readdir(assetDir);
  const scriptName = files.find((file) => file.endsWith(".js"));
  assert.ok(scriptName, "expected a JavaScript application bundle");
  const script = await readFile(new URL(scriptName, assetDir), "utf8");
  assert.match(script, /快速標籤/);
  assert.match(script, /分類標籤/);
  assert.match(script, /每次出現/);
  assert.match(script, /每筆證據一次/);
  assert.match(script, /結帳台/);
  assert.match(script, /人物管理/);
  assert.match(script, /照片證據/);
  assert.match(script, /未指定/);
  assert.match(script, /完成快速標記/);
  assert.match(script, /匯出摘要/);
  assert.match(script, /另存 PDF/);
  assert.doesNotMatch(script, /noopener,noreferrer/);
});
