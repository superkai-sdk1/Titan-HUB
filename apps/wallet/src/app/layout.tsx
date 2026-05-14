import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Titan Wallet',
  description: 'Ваш баланс и бонусы',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
