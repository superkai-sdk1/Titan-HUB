import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Titan Resident',
  description: 'Ваш баланс и бонусы',
}

// viewport-fit=cover — чтобы env(safe-area-inset-*) были ненулевыми в полноэкранном
// PWA (иначе контент уходит под «остров»/чёлку iPhone). themeColor задаём здесь
// (а не <meta> в head) — Next подставит один тег, без дублей.
export const viewport: Viewport = {
  themeColor: '#15121b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {/* Иконки/манифест прописаны явно с префиксом /wallet: приложение собрано с
            basePath '/wallet', а basePath не всегда применяется к metadata-иконкам. */}
        <link rel="manifest" href="/wallet/manifest.json" />
        <link rel="icon" type="image/svg+xml" href="/wallet/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/wallet/favicon-32.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/wallet/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* black-translucent — иммерсивный тёмный бар; контент уходит под «остров»,
            поэтому страница добавляет safe-area отступ сверху (см. page.tsx styles.root). */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Titan Resident" />
        {/* Telegram WebApp SDK — БЕЗ него window.Telegram.WebApp недоступен и кошелёк
            не авторизуется (показывает «Откройте через Telegram»). beforeInteractive —
            чтобы объект был готов до запуска клиентского кода страницы. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  )
}
