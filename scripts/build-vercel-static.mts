import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "dist");

await fs.mkdir(outputDir, { recursive: true });
await Promise.all([
  fs.copyFile(path.join(projectRoot, "index.html"), path.join(outputDir, "index.html")),
  fs.copyFile(path.join(projectRoot, "favicon.svg"), path.join(outputDir, "favicon.svg")),
  fs.copyFile(path.join(projectRoot, "public", "app.js"), path.join(outputDir, "app.js")),
  fs.copyFile(path.join(projectRoot, "public", "styles.css"), path.join(outputDir, "styles.css")),
  fs.cp(path.join(projectRoot, "assets"), path.join(outputDir, "assets"), { recursive: true }),
]);
