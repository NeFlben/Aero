import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / WASM packages must stay outside the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "sharp", "exceljs", "postgres", "nodemailer"],
  // Migrations are read from disk at startup; serverless bundles must ship them.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  // The service worker must never be cached by the browser, or updates would not arrive.
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Content-Type", value: "application/javascript; charset=utf-8" }, { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      { source: "/vendor/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
