import path from 'path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@titan/ui', '@titan/types'],
  // Titan Resident отдаётся под префиксом /residents за nginx (SaaS: каждый клуб
  // на своём поддомене, напр. kbr.titanpos.ru/residents). basePath переписывает
  // ВСЕ ссылки и метаданные роутера под /residents, а assetPrefix гарантирует, что
  // статические чанки эмитятся как /residents/_next/static/... — тогда nginx
  // маршрутизирует их на upstream wallet (а не на web, как делал общий regex
  // по .js/.css), и PWA перестаёт быть пустой. Запросы к API — ОТНОСИТЕЛЬНЫЕ
  // (`/api/...`, same-origin): поддомен клуба бьёт в свой клуб (tenantContext).
  basePath: '/residents',
  assetPrefix: '/residents',
}

export default nextConfig
