import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { AuthGuard } from '@/components/AuthGuard'
import { BottomNav } from '@/components/BottomNav'
import { Sidebar } from '@/components/Sidebar'
import { SessionLock } from '@/components/SessionLock'
import { StaffNotifications } from '@/components/StaffNotifications'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'

export const metadata: Metadata = {
  title: 'Titan HUB',
  description: 'Кассовая система',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Titan HUB',
  },
  other: {
    // Next 15 эмитит только mobile-web-app-capable, но iOS для корректного
    // standalone (без резерва под фантомный нижний тулбар Safari, который
    // поднимает fixed bottom:0) требует legacy-мету. Добавляем явно.
    'apple-mobile-web-app-capable': 'yes',
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
      <head />
      <body className="bg-mesh" style={{ color: 'var(--on-surface)', overflow: 'hidden', maxWidth: '100vw', overscrollBehavior: 'none' }}>
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
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  paddingBottom: 0,
                  WebkitOverflowScrolling: 'touch' as any,
                }}
                className="layout-content"
              >
                {children}
              </main>
            </div>

            {/* Mobile bottom nav (hidden on desktop via CSS) */}
            <BottomNav />

            {/* SSE-toasts для staff/owner: вызовы с планшета, запросы счёта */}
            <StaffNotifications />

            {/* Service Worker для PWA-offline */}
            <ServiceWorkerRegister />
          </AuthGuard>
        </Providers>

        {/* Layout responsive shifts */}
        <style>{`
          /* Глобальная защита от горизонтального скролла */
          *, *::before, *::after { box-sizing: border-box; }
          div, section, main, header, footer, nav, aside {
            max-width: 100%;
            min-width: 0;
          }

          /* Нижняя навигация «парит» поверх контента (полупрозрачный остров),
             поэтому НЕ резервируем под неё место контейнером — контент заполняет
             всю высоту и проходит под панелью. Отступ кладём только на скролл-
             область, чтобы последние элементы можно было докрутить выше панели.
             Для height:100% страниц (карточка чека) этот отступ скролл-области
             тоже уменьшает доступную высоту → их прижатый низ не перекрывается. */
          @media (max-width: 1023px) {
            .layout-main {
              /* Safe area top — только padding сверху, без боковых (они вызывают сдвиг) */
              padding-top: env(safe-area-inset-top);
              overflow: hidden;
              max-width: 100vw;
            }
            .layout-content {
              padding-bottom: var(--bottom-nav-clear, 0px);
              overflow-x: hidden;
              overscroll-behavior: none;
            }
          }
        `}</style>
      </body>
    </html>
  )
}
