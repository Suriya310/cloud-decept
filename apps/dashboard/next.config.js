/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8004'}/:path*`,
      },
      {
        source: '/api/collector/:path*',
        destination: `${process.env.NEXT_PUBLIC_COLLECTOR_URL || 'http://localhost:8000'}/:path*`,
      },
      {
        source: '/api/threat-intel/:path*',
        destination: `${process.env.NEXT_PUBLIC_THREAT_INTEL_URL || 'http://localhost:8005'}/:path*`,
      },
      {
        source: '/api/adaptive/:path*',
        destination: `${process.env.NEXT_PUBLIC_ADAPTIVE_URL || 'http://localhost:8002'}/:path*`,
      },
      {
        source: '/api/intent/:path*',
        destination: `${process.env.NEXT_PUBLIC_INTENT_URL || 'http://localhost:8001'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;