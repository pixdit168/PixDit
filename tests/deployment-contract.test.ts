import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("Vercel routes serve compiled assets and keep generated images on the API", async () => {
  const config = JSON.parse(await fs.readFile(path.join(projectRoot, "vercel.json"), "utf8"));
  assert.ok(config.builds.some((entry: { src: string; use: string }) => entry.src === "api/index.ts" && entry.use === "@vercel/node"));
  assert.ok(config.builds.some((entry: { src: string; use: string; config?: { distDir?: string } }) =>
    entry.src === "package.json" && entry.use === "@vercel/static-build" && entry.config?.distDir === "dist"));
  assert.ok(!config.builds.some((entry: { src: string }) => entry.src === "public/app.js"));

  const rewrites = new Map(config.rewrites.map((entry: { source: string; destination: string }) => [entry.source, entry.destination]));
  assert.equal(rewrites.get("/api/(.*)"), "/api/index.ts");
  assert.equal(rewrites.get("/generated/(.*)"), "/api/index.ts");
  assert.equal(rewrites.has("/app.js"), false);
  assert.equal(rewrites.get("/favicon.ico"), "/favicon.svg");

  const html = await fs.readFile(path.join(projectRoot, "index.html"), "utf8");
  const browserConfig = JSON.parse(await fs.readFile(path.join(projectRoot, "tsconfig.browser.json"), "utf8"));
  assert.equal(browserConfig.compilerOptions.module, "none");
  assert.equal(browserConfig.compilerOptions.outFile, "public/app.js");
  assert.equal(browserConfig.files.length, 9);
  const browserSource = (await Promise.all(browserConfig.files.map((name: string) => fs.readFile(path.join(projectRoot, name), "utf8")))).join("\n");
  const browserScript = await fs.readFile(path.join(projectRoot, "public/app.js"), "utf8");
  const publishedScript = await fs.readFile(path.join(projectRoot, "dist/app.js"), "utf8");
  assert.match(html, /<script src="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /Arah Visual|Pengaturan Lanjutan|id="poster-advanced"/);
  assert.match(html, /id="brand-logo-input"[\s\S]*?AI akan menyesuaikan warna dan menempatkan logo/);
  assert.match(html, /class="is-hidden" aria-hidden="true">[\s\S]*?id="brand-input"/);
  assert.match(html, /id="product-image-input"[^>]*multiple/);
  assert.match(html, /Gambar Produk <span class="optional-label">Maksimal 5<\/span>/);
  assert.doesNotMatch(html, /id="brand-logo-input"[^>]*multiple/);
  assert.match(html, /class="source-upload-stack"[\s\S]*?id="product-image-preview"[\s\S]*?id="brand-logo-preview"/);
  assert.match(browserSource, /data-remove-product-image/);
  assert.match(browserSource, /data-remove-brand-logo/);
  assert.doesNotMatch(html, /data-headline-mode|id="reset-controls"/);
  assert.match(browserSource, /compositionMode: "ai"/);
  assert.match(browserSource, /brandLogo,/);
  assert.match(browserSource, /variationName\(conceptIndex\)/);
  assert.doesNotMatch(browserSource, /Human Narrative|Kinetic Impact|Agent Aruna|Agent Bima/);
  assert.equal(publishedScript, browserScript);
  assert.match(publishedScript, /^const \$ = /);
  assert.doesNotMatch(browserScript, /^\s*(?:import|export)\s/m);
  assert.doesNotMatch(browserScript, /^\s*["']use strict["'];/);
  assert.equal(await fs.readFile(path.join(projectRoot, "dist/index.html"), "utf8"), html);
  assert.equal(await fs.readFile(path.join(projectRoot, "dist/styles.css"), "utf8"), await fs.readFile(path.join(projectRoot, "public/styles.css"), "utf8"));
  assert.match(await fs.readFile(path.join(projectRoot, "public/styles.css"), "utf8"), /#library-preview-poster\.api-poster \.poster-copy \{ background:none !important; \}/);
  assert.match(await fs.readFile(path.join(projectRoot, "public/styles.css"), "utf8"), /\.poster\.api-poster \.poster-copy\.no-text \{ background:transparent !important; \}/);
  assert.ok((await fs.stat(path.join(projectRoot, "dist/favicon.svg"))).isFile());
  assert.ok((await fs.stat(path.join(projectRoot, "dist/assets/kopi-gula-aren.png"))).isFile());
});
