import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // postgres.js and pglite are pure JS; pglite ships a wasm asset the tracer must keep.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
