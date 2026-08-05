/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    domains: ['localhost'],
  },
  async rewrites() {
    return [
      {
        source: '/api/clickhouse/:path*',
        destination: `${process.env.CLICKHOUSE_URL || 'http://localhost:8123'}/:path*`,
      },
      {
        source: '/api/intent/:path*',
        destination: `${process.env.INTENT_ENGINE_URL || 'http://localhost:8000'}/:path*`,
      },
      {
        source: '/api/adaptive/:path*',
        destination: `${process.env.ADAPTIVE_ENGINE_URL || 'http://localhost:8001'}/:path*`,
      },
      {
        source: '/api/intel/:path*',
        destination: `${process.env.THREAT_INTEL_URL || 'http://localhost:8002'}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig