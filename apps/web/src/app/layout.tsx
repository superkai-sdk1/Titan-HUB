import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { AuthGuard } from '@/components/AuthGuard'
import { BottomNav } from '@/components/BottomNav'
import { GlobalPullToRefresh } from '@/components/GlobalPullToRefresh'
import { Sidebar } from '@/components/Sidebar'
import { SessionLock } from '@/components/SessionLock'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'

export const metadata: Metadata = {
  title: 'Titan HUB',
  description: 'Кассовая система',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    // 'default' (не 'black-translucent'): standalone-вебвью НЕ уходит под статус-бар
    // edge-to-edge — iOS корректно отдаёт размер вьюпорта с первого кадра, без бага
    // «короткого вьюпорта до поворота» (тёмная полоса снизу). Статус-бар становится
    // непрозрачным, но того же цвета (#15121b, theme-color) — сливается с приложением.
    statusBarStyle: 'default',
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
  // 'auto' (не 'cover'): отдаём управление safe-area системе. Вебвью сразу корректного
  // размера (нет бага «короткого вьюпорта до поворота» → нет тёмной полосы снизу).
  // Зоны safe-area iOS закрашивает фоном окна = theme-color #15121b → сливается.
  viewportFit: 'auto',
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

            {/* Глобальный pull-to-refresh (цепляется к .layout-content) */}
            <GlobalPullToRefresh />

            {/* Mobile bottom nav (hidden on desktop via CSS) */}
            <BottomNav />

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

          /* Нижняя навигация «парит» поверх контента (полупрозрачный остров).
             Контейнеры НЕ укорачиваем — контент занимает всю высоту экрана и
             проходит под панелью (никаких тёмных зарезервированных полос).
             Чтобы последний элемент (кнопка оплаты, низ настроек) не оставался
             под панелью, нижний отступ кладём на САМ КОНТЕНТ страницы (последний
             прямой потомок скролл-области), а не на скролл-область: у flex-колонки
             с overflow:auto WebKit/iOS игнорирует её собственный padding-bottom
             при переполнении (известный баг flexbox). Для height:100% страниц
             (карточка чека) этот отступ уменьшает их content-box и поднимает
             прижатый футер выше панели. :has(.bottom-nav-root) — применяем только
             когда панель реально на экране (не на /login и /tablet). */
          @media (max-width: 1023px) {
            .layout-main {
              /* Safe area top — только padding сверху, без боковых (они вызывают сдвиг) */
              padding-top: env(safe-area-inset-top);
              overflow: hidden;
              max-width: 100vw;
            }
            .layout-content {
              overflow-x: hidden;
              overscroll-behavior: none;
            }
            body:has(.bottom-nav-root) .layout-content > :last-child {
              padding-bottom: var(--bottom-nav-clear, 0px);
            }
          }
        `}</style>
      </body>
    </html>
  )
}
