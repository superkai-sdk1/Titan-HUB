import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { AuthGuard } from '@/components/AuthGuard'
import { BottomNav } from '@/components/BottomNav'

export const metadata: Metadata = {
  title: 'Titan HUB',
  description: 'Кассовая система',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Titan HUB',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0e1a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body>
        <Providers>
          <AuthGuard>
            <main className="pb-20">{children}</main>
            <BottomNav />
          </AuthGuard>
        </Providers>
      </body>
    </html>
  )
}
