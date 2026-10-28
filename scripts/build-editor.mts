import { build } from "esbuild";
const options = {
  entryPoints: ["editor/index.tsx"],
  tsconfig: "tsconfig.editor.json",
  jsx: "automatic" as const,
  define: { "process.env.NODE_ENV": '"production"' },
  bundle: true,
  outfile: "public/editor.js",
  platform: "browser" as const,
  format: "iife" as const,
  target: "es2022",
  minify: true,
  sourcemap: false,
  legalComments: "none" as const,
};
if (process.argv.includes("--watch")) {
  const { context } = await import("esbuild");
  const ctx = await context(options);
  await ctx.watch();
} else await build(options);
