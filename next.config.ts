import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // pdf-parse (via pdfjs-dist) loads a worker script by relative path at
  // runtime; bundling it with Turbopack breaks that resolution, so it needs
  // to run as a plain Node dependency instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
