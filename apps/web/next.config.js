const { execSync } = require('child_process');

/**
 * Which build is running, for the 404 debugger: the commit (BUILD_SHA when
 * set, as in a Docker build without .git; else git), when it was built, and
 * the Next.js version. Public values only.
 */
function buildSha() {
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_NEXT_VERSION: require('next/package.json').version,
  },
  transpilePackages: ['@halo/shared'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // Next 15 moved this out of `experimental`.
  serverExternalPackages: ['@descope/node-sdk'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@descope/node-sdk': false,
      };
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

