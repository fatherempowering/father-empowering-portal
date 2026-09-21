// Uses the bundler already installed with Vitest. No hosted service is contacted.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const viteRequire = createRequire(
  createRequire(require.resolve("vitest/package.json")).resolve(
    "vite/package.json",
  ),
);
const { build } = viteRequire("esbuild");
const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "../..");
const output = resolve(app, "../../test-results/ux-preview");
await mkdir(output, { recursive: true });
await build({
  entryPoints: [resolve(here, "harness.tsx")],
  bundle: true,
  outdir: output,
  jsx: "automatic",
  external: ["/fonts/*"],
  define: { "process.env.NODE_ENV": '"development"' },
  alias: {
    "@": resolve(app, "src"),
    "next/link": resolve(here, "next-link.tsx"),
    "next/image": resolve(here, "next-image.tsx"),
  },
  loader: { ".woff2": "file" },
  logLevel: "warning",
});
await writeFile(
  resolve(output, "index.html"),
  '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FE M1.5 — UI test harness</title><link rel="stylesheet" href="/harness.css"><div id="root"></div><script src="/harness.js"></script></html>',
);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3016");
  const path = decodeURIComponent(url.pathname);
  const root =
    path.startsWith("/brand/") ||
    path.startsWith("/fonts/") ||
    path === "/icon-192.png"
      ? resolve(app, "public")
      : output;
  const file = resolve(
    root,
    "." + (path === "/" || !extname(path) ? "/index.html" : path),
  );
  if (!file.startsWith(root + "/")) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(3016, "127.0.0.1", () =>
  console.log("Isolated UI harness: http://127.0.0.1:3016"),
);
