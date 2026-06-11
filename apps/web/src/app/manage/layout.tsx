'use client'
/**
 * Сплит-вью «Управления» на десктопе (≥1024), как в Кассе:
 * слева — меню разделов со своей шапкой, справа — выбранный раздел со своей
 * шапкой (PageHeader с кнопкой «назад»). Открытие раздела анимируется
 * простым слайдом справа (как и панель чека в POS). Ширина меню тянется
 * мышью/пальцем за ручку между панелями и сохраняется в localStorage.
 *
 * Внутри правой панели контент раздела занимает всю доступную ширину:
 * токены --content-narrow/--content-wide переопределены на 100% в скоупе
 * .manage-split-detail (страницы используют их через var()).
 *
 * На мобильном обёртки схлопываются в display:contents — DOM и поведение
 * полностью как раньше (меню и разделы — отдельные полноэкранные страницы).
 */
import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { ManageMenu } from '@/components/manage/ManageMenu'

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isRoot = pathname === '/manage'

  // ── Регулируемая ширина меню (как сплит в POS) ──────────────────────────
  const splitRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const saved = parseInt(localStorage.getItem('manage-split-w') ?? '')
    if (saved && splitRef.current) splitRef.current.style.setProperty('--manage-menu-w', `${saved}px`)
  }, [])
  const startSplitDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const root = splitRef.current
    if (!root) return
    const left = root.getBoundingClientRect().left
    let last = 0
    const onMove = (ev: PointerEvent) => {
      // Ширина меню = расстояние от левого края сплита до курсора.
      last = Math.round(Math.min(Math.max(ev.clientX - left, 300), Math.min(620, window.innerWidth - 480)))
      root.style.setProperty('--manage-menu-w', `${last}px`)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (last) localStorage.setItem('manage-split-w', String(last))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [])

  return (
    <div className="manage-split" ref={splitRef}>
      <aside className="manage-split-menu">
        <ManageMenu />
      </aside>
      {/* Ручка регулировки (десктоп, когда открыт раздел) */}
      {!isRoot && (
        <div
          className="manage-split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину меню"
          onPointerDown={startSplitDrag}
        >
          <div className="manage-split-grip" />
        </div>
      )}
      {/* key=pathname — анимация заново при переходе между разделами */}
      <div key={pathname} className={`manage-split-detail${isRoot ? ' is-root' : ''}`}>
        {children}
      </div>
      <style>{`
        /* Мобильный/планшет (<1024): обёртки прозрачны для раскладки. */
        .manage-split, .manage-split-detail { display: contents; }
        .manage-split-menu, .manage-split-handle { display: none; }

        @keyframes split-panel-in {
          from { opacity: 0; transform: translateX(28px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .manage-split-detail { animation: none !important; }
        }

        @media (min-width: 1024px) {
          .manage-split {
            display: flex;
            flex: 1;
            min-height: 0;
            width: 100%;
          }
          .manage-split-menu {
            display: block;
            width: var(--manage-menu-w, 420px);
            flex-shrink: 0;
            overflow-y: auto;
            border-right: 1px solid rgba(255,255,255,0.07);
          }
          .manage-split-handle {
            display: flex; align-items: center; justify-content: center;
            width: 14px; margin: 0 -7px; flex-shrink: 0;
            cursor: col-resize; touch-action: none; user-select: none;
            position: relative; z-index: 5;
          }
          .manage-split-grip {
            width: 4px; height: 44px; border-radius: 4px;
            background: rgba(255,255,255,0.14);
            transition: background 0.15s;
          }
          .manage-split-handle:hover .manage-split-grip,
          .manage-split-handle:active .manage-split-grip { background: rgba(139,92,246,0.65); }
          .manage-split-detail {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-width: 0;
            overflow-y: auto;
            /* Контент раздела заполняет панель целиком (страницы берут ширину из токенов) */
            --content-narrow: 100%;
            --content-wide: 100%;
          }
          .manage-split-detail:not(.is-root) {
            animation: split-panel-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
        }
      `}</style>
    </div>
  )
}
