'use client'
/**
 * Сплит-вью «Управления» на десктопе (≥1024), как в Кассе:
 * слева — меню разделов со своей шапкой, справа — выбранный раздел со своей
 * шапкой (PageHeader с кнопкой «назад»). Открытие раздела анимируется
 * простым слайдом справа (как и панель чека в POS).
 *
 * На мобильном обёртки схлопываются в display:contents — DOM и поведение
 * полностью как раньше (меню и разделы — отдельные полноэкранные страницы).
 */
import { usePathname } from 'next/navigation'
import { ManageMenu } from '@/components/manage/ManageMenu'

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isRoot = pathname === '/manage'

  return (
    <div className="manage-split">
      <aside className="manage-split-menu">
        <ManageMenu />
      </aside>
      {/* key=pathname — анимация заново при переходе между разделами */}
      <div key={pathname} className={`manage-split-detail${isRoot ? ' is-root' : ''}`}>
        {children}
      </div>
      <style>{`
        /* Мобильный/планшет (<1024): обёртки прозрачны для раскладки. */
        .manage-split, .manage-split-detail { display: contents; }
        .manage-split-menu { display: none; }

        @media (min-width: 1024px) {
          .manage-split {
            display: flex;
            flex: 1;
            min-height: 0;
            width: 100%;
          }
          .manage-split-menu {
            display: block;
            width: 420px;
            flex-shrink: 0;
            overflow-y: auto;
            border-right: 1px solid rgba(255,255,255,0.07);
          }
          .manage-split-detail {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-width: 0;
            overflow-y: auto;
          }
          .manage-split-detail:not(.is-root) {
            animation: split-panel-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
        }
        @keyframes split-panel-in {
          from { opacity: 0; transform: translateX(28px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .manage-split-detail:not(.is-root) { animation: none; }
        }
      `}</style>
    </div>
  )
}
