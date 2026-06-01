import type { Metadata } from 'next'
import Script from 'next/script'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Titan Wallet',
  description: 'Ваш баланс и бонусы',
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
        <meta name="theme-color" content="#15121b" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Titan Wallet" />
        {/* Telegram WebApp SDK — БЕЗ него window.Telegram.WebApp недоступен и кошелёк
            не авторизуется (показывает «Откройте через Telegram»). beforeInteractive —
            чтобы объект был готов до запуска клиентского кода страницы. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  )
}
