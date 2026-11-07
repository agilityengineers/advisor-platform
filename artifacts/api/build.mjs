import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "dist");

await rm(dist, { recursive: true, force: true });

await build({
  entryPoints: [path.resolve(here, "src/index.ts")],
  platform: "node",
  target: "node22",
  bundle: true,
  format: "esm",
  outdir: dist,
  outExtension: { ".js": ".mjs" },
  sourcemap: "linked",
  logLevel: "info",
  // Native or dynamic-loading packages stay external and resolve from node_modules at runtime.
  external: ["vite", "pg-native", "@sendgrid/*", "pino-pretty", "*.node"],
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      "import __path from 'node:path';",
      "import __url from 'node:url';",
      "globalThis.require = __cr(import.meta.url);",
      "globalThis.__filename = __url.fileURLToPath(import.meta.url);",
      "globalThis.__dirname = __path.dirname(globalThis.__filename);",
    ].join("\n"),
  },
});
