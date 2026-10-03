import type { Metadata } from 'next'

// Titan Home — меню и касса самообслуживания на планшете кабинки. Свой манифест:
// установленное с /tablet приложение называется Titan Home и открывается сразу
// в киоске, а не в кассе Titan HUB (корневой manifest.json).
export const metadata: Metadata = {
  title: 'Titan Home',
  description: 'Меню и касса самообслуживания',
  manifest: '/titan-home.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Titan Home' },
}

export default function TabletLayout({ children }: { children: React.ReactNode }) {
  // Авторизацией планшета управляет сама страница /tablet (выбор пространства →
  // PIN сотрудника). Layout лишь даёт полноэкранную тёмную обёртку-киоск.
  return (
    <>
      {/* Сбрасываем отступы layout-main и layout-content для планшета */}
      <style>{`
        .layout-main { margin-left: 0 !important; }
        .layout-content { padding-bottom: 0 !important; }
      `}</style>
      <div style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--background)',
        color: 'var(--on-surface)',
      }}>
        {children}
      </div>
    </>
  )
}
