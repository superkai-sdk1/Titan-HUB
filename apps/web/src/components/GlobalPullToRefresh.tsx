'use client'
/**
 * Pull-to-refresh для ОСНОВНОГО контента: свайп сверху вниз (когда скролл вверху)
 * обновляет данные. Не создаёт свой скролл-контейнер — цепляется к уже существующему
 * `.layout-content` и тянет его контент вниз во время жеста. Обновление = invalidate
 * всех React Query.
 *
 * ВАЖНО: жест срабатывает ТОЛЬКО когда тянут сам основной контент. Если касание
 * началось внутри модалки/Sheet (портал вне .layout-content) или внутри вложенного
 * вертикального скроллера — PTR не вмешивается, чтобы не блокировать их прокрутку.
 *
 * Отключён там, где свайп неуместен или есть свой PTR: /login, /tablet*, /pos*
 * (свой PTR + карточка чека), /dashboard* (свой PTR).
 */
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Icon } from '@/components/Icon'

const THRESHOLD = 80
const MAX_PULL = 120

function disabledFor(p: string): boolean {
  return p === '/login'
    || p.startsWith('/tablet')
    || p === '/pos' || p.startsWith('/pos/')
    || p === '/dashboard' || p.startsWith('/dashboard/')
}

export function GlobalPullToRefresh() {
  const pathname = usePathname()
  const qc = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)
  const disabled = disabledFor(pathname)

  useEffect(() => {
    if (disabled) return
    const el = document.querySelector('.layout-content') as HTMLElement | null
    if (!el) return

    let startY: number | null = null
    let cur = 0

    // Касание началось внутри вложенного вертикального скроллера (Sheet/список
    // с overflow:auto) между target и .layout-content? Тогда PTR не вмешивается —
    // прокрутка модалки/списка должна работать как обычно.
    const inNestedScroll = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null
      while (node && node !== el) {
        const oy = getComputedStyle(node).overflowY
        if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) return true
        node = node.parentElement
      }
      return false
    }
    const apply = (v: number) => {
      cur = v
      setPull(v)
      // Тянем контент вниз пальцем (как в POS); индикатор сверху проявляется в зазоре.
      el.style.transform = v > 0 ? `translateY(${v}px)` : ''
      el.style.transition = 'none'
    }
    const reset = (animate: boolean) => {
      cur = 0
      setPull(0)
      el.style.transition = animate ? 'transform 0.3s ease' : 'none'
      el.style.transform = ''
    }

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      const target = e.target as Node | null
      // Касание вне основного контента (портал модалки/Sheet) — игнорируем.
      if (!target || !el.contains(target)) { startY = null; return }
      // Касание внутри вложенного скроллера (Sheet/список) — не вмешиваемся.
      if (inNestedScroll(e.target)) { startY = null; return }
      if (el.scrollTop > 0) { startY = null; return }
      startY = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (startY === null || refreshingRef.current) return
      if (el.scrollTop > 0) { startY = null; reset(false); return }
      const dy = e.touches[0].clientY - startY
      if (dy <= 0) { if (cur !== 0) reset(false); return }
      e.preventDefault()
      apply(Math.min(dy * 0.5, MAX_PULL))
    }
    const onEnd = async () => {
      if (startY === null) return
      startY = null
      if (cur >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true
        setRefreshing(true)
        setPull(THRESHOLD)
        el.style.transition = 'transform 0.2s ease'
        el.style.transform = `translateY(${THRESHOLD}px)`
        try { await qc.invalidateQueries() } finally {
          refreshingRef.current = false
          setRefreshing(false)
          reset(true)
        }
      } else {
        reset(true)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.style.transform = ''
      el.style.transition = ''
    }
  }, [disabled, pathname, qc])

  if (disabled) return null
  const indicatorH = refreshing ? THRESHOLD : pull
  const progress = Math.min(pull / THRESHOLD, 1)
  if (indicatorH <= 8 && !refreshing) return null

  return (
    <div
      style={{
        position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0,
        height: indicatorH, zIndex: 35, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        transition: refreshing ? 'height 0.2s ease' : 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: refreshing ? 1 : progress, transform: `scale(${0.6 + progress * 0.4})` }}>
        {refreshing ? (
          <>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#8B5CF6', animation: 'ptr-spin 0.6s linear infinite' }} />
            <span style={{ fontSize: 11, color: '#8B5CF6', fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>ОБНОВЛЕНИЕ…</span>
          </>
        ) : (
          <>
            <Icon name="arrow_downward" size={20} color="#8B5CF6" style={{ transform: progress >= 1 ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
            <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>{progress >= 1 ? 'ОТПУСТИТЕ' : 'ПОТЯНИТЕ ВНИЗ'}</span>
          </>
        )}
      </div>
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
