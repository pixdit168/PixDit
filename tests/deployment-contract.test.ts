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
  const browserScript = await fs.readFile(path.join(projectRoot, "public/app.js"), "utf8");
  const publishedScript = await fs.readFile(path.join(projectRoot, "dist/app.js"), "utf8");
  assert.match(html, /<script src="\/app\.js"><\/script>/);
  assert.equal(publishedScript, browserScript);
  assert.match(publishedScript, /^const \$ = /);
  assert.doesNotMatch(browserScript, /^\s*(?:import|export)\s/m);
  assert.doesNotMatch(browserScript, /^\s*["']use strict["'];/);
  assert.equal(await fs.readFile(path.join(projectRoot, "dist/index.html"), "utf8"), html);
  assert.equal(await fs.readFile(path.join(projectRoot, "dist/styles.css"), "utf8"), await fs.readFile(path.join(projectRoot, "public/styles.css"), "utf8"));
  assert.ok((await fs.stat(path.join(projectRoot, "dist/favicon.svg"))).isFile());
  assert.ok((await fs.stat(path.join(projectRoot, "dist/assets/kopi-gula-aren.png"))).isFile());
});
