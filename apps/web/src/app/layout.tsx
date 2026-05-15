import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { AuthGuard } from '@/components/AuthGuard'
import { BottomNav } from '@/components/BottomNav'
import { Sidebar } from '@/components/Sidebar'
import { SessionLock } from '@/components/SessionLock'

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
  themeColor: '#15121b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="bg-mesh" style={{ color: 'var(--on-surface)', overflow: 'hidden' }}>
        <Providers>
          <SessionLock />
          <AuthGuard>
            {/* Desktop sidebar (hidden on mobile via CSS) */}
            <Sidebar />

            {/* Main content area shifted right on desktop */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100dvh',
                overflow: 'hidden',
                // On desktop: leave 260px for sidebar
              }}
              className="layout-main"
            >
              <main
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  // Mobile: bottom nav space
                  paddingBottom: 0,
                }}
                className="layout-content"
              >
                {children}
              </main>
            </div>

            {/* Mobile bottom nav (hidden on desktop via CSS) */}
            <BottomNav />
          </AuthGuard>
        </Providers>

        {/* Layout responsive shifts */}
        <style>{`
          @media (max-width: 1023px) {
            .layout-content {
              padding-bottom: 80px;
            }
          }
        `}</style>
      </body>
    </html>
  )
}
