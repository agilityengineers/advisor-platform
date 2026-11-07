import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/** Development only: let Vite's hot-reload socket through the SPA's CSP. Production keeps `connect-src 'self'` plus the named providers. */
function devCsp() {
  return {
    name: "dev-csp",
    apply: "serve" as const,
    transformIndexHtml(html: string) {
      return html.replace("connect-src 'self'", "connect-src 'self' ws: wss:");
    },
  };
}

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react(), tailwindcss(), devCsp()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: { "/api": { target: `http://localhost:${process.env.PORT ?? 5000}`, changeOrigin: false } },
    fs: { strict: true, deny: ["**/.*"] },
  },
});
