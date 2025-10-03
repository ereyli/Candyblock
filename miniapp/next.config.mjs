/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  webpack: (config, { dev }) => {
    // Use in-memory cache in dev to avoid filesystem pack corruption
    if (dev) {
      config.cache = { type: 'memory' };
    }
    return config;
  }
};

export default nextConfig;
