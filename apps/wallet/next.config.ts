import path from 'path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@titan/ui', '@titan/types'],
  // Кошелёк отдаётся под префиксом /wallet за nginx. basePath переписывает
  // ВСЕ ссылки и метаданные роутера под /wallet, а assetPrefix гарантирует, что
  // статические чанки эмитятся как /wallet/_next/static/... — тогда nginx
  // маршрутизирует их на upstream wallet (а не на web, как делал общий regex
  // по .js/.css), и PWA перестаёт быть пустой. Запросы к API остаются
  // абсолютными (`${API_URL}/api/...`), basePath на них не влияет.
  basePath: '/wallet',
  assetPrefix: '/wallet',
}

export default nextConfig
