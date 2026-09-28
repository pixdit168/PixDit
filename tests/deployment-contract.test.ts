import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("Vercel routes serve compiled assets and keep generated images on the API", async () => {
  const config = JSON.parse(await fs.readFile(path.join(projectRoot, "vercel.json"), "utf8"));
  const builds = config.builds.map((entry: { src: string }) => entry.src);
  assert.ok(builds.includes("api/index.ts"));
  assert.ok(builds.includes("public/app.js"));
  assert.ok(builds.includes("public/styles.css"));
  assert.ok(!builds.includes("public/**"));

  const rewrites = new Map(config.rewrites.map((entry: { source: string; destination: string }) => [entry.source, entry.destination]));
  assert.equal(rewrites.get("/api/(.*)"), "/api/index.ts");
  assert.equal(rewrites.get("/generated/(.*)"), "/api/index.ts");
  assert.equal(rewrites.get("/app.js"), "/public/app.js");
  assert.equal(rewrites.get("/favicon.ico"), "/favicon.svg");

  const html = await fs.readFile(path.join(projectRoot, "index.html"), "utf8");
  const browserScript = await fs.readFile(path.join(projectRoot, "public/app.js"), "utf8");
  assert.match(html, /<script src="\/app\.js"><\/script>/);
  assert.doesNotMatch(browserScript, /^\s*(?:import|export)\s/m);
  assert.doesNotMatch(browserScript, /^\s*["']use strict["'];/);
});
