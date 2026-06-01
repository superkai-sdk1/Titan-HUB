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
        {/* Telegram WebApp SDK — БЕЗ него window.Telegram.WebApp недоступен и кошелёк
            не авторизуется (показывает «Откройте через Telegram»). beforeInteractive —
            чтобы объект был готов до запуска клиентского кода страницы. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  )
}
