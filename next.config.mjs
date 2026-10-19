/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the dev watcher and production build from writing the same cache.
  distDir: process.env.NEXT_DIST_DIR || ".next-dev"
};

export default nextConfig;
