/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint wiring lands in a later step; keep step-1 builds green.
  eslint: { ignoreDuringBuilds: true },
  // Self-contained server bundle for the deploy image (node server.js — no pnpm store at runtime).
  output: "standalone",
};

export default nextConfig;
