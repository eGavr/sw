/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint wiring lands in a later step; keep step-1 builds green.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
