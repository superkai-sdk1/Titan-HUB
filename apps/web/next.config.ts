import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@titan/ui', '@titan/types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'titanpos.ru' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
}

export default nextConfig
