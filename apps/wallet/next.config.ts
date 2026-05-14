import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@titan/ui', '@titan/types'],
}

export default nextConfig
