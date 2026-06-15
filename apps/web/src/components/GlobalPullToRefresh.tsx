'use client'
/**
 * Pull-to-refresh для ОСНОВНОГО контента: свайп сверху вниз (когда скролл вверху)
 * обновляет данные. Не создаёт свой скролл-контейнер — цепляется к уже существующему
 * `.layout-content`. Обновление = invalidate всех React Query.
 *
 * САМ КОНТЕНТ НЕ ДВИГАЕМ (Material-style): индикатор-спиннер опускается сверху, а
 * страница и её липкая шапка (PageHeader = position:sticky) остаются на месте.
 * Раньше тянули `.layout-content` через transform — но это утягивало вниз и шапку,
 * и выглядело так, будто «свайпается шапка, а не содержимое».
 *
 * Слушатель touchmove — PASSIVE и без preventDefault: за верхнюю границу прокрутки
 * не пускает уже `overscroll-behavior: none` на .layout-content. Non-passive touchmove
 * на скролл-контейнере убивал инерцию (momentum) iOS — поэтому в «Управлении» прокрутка
 * шла рывками, а в «Аналитике» (где PTR отключён) была плавной.
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
    || p === '/ai' || p.startsWith('/ai/') // у TITAN AI свой внутренний скролл + композер
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
    // Двигаем только индикатор (через состояние pull) — сам .layout-content не трогаем,
    // чтобы не утягивать липкую шапку и не ломать momentum.
    const apply = (v: number) => {
      cur = v
      setPull(v)
    }
    const reset = () => {
      cur = 0
      setPull(0)
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
      if (el.scrollTop > 0) { startY = null; reset(); return }
      const dy = e.touches[0].clientY - startY
      if (dy <= 0) { if (cur !== 0) reset(); return }
      // НЕ вызываем preventDefault: за верхнюю границу не пускает overscroll-behavior:none,
      // а passive-слушатель сохраняет инерцию прокрутки.
      apply(Math.min(dy * 0.5, MAX_PULL))
    }
    const onEnd = async () => {
      if (startY === null) return
      startY = null
      if (cur >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true
        setRefreshing(true)
        setPull(THRESHOLD)
        try { await qc.invalidateQueries() } finally {
          refreshingRef.current = false
          setRefreshing(false)
          reset()
        }
      } else {
        reset()
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [disabled, pathname, qc])

  if (disabled) return null
  const indicatorH = refreshing ? THRESHOLD : pull
  const progress = Math.min(pull / THRESHOLD, 1)
  if (indicatorH <= 8 && !refreshing) return null

  // Контент стоит на месте — поэтому индикатор это компактная «таблетка», которая
  // опускается сверху поверх шапки (своя матовая подложка, чтобы читалась над любым
  // фоном), а не строка с текстом, налезающая на заголовок раздела.
  const chipY = Math.max(8, indicatorH - 18)
  return (
    <div
      style={{
        position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0,
        height: 0, zIndex: 35, pointerEvents: 'none',
        display: 'flex', justifyContent: 'center',
      }}
    >
      <div
        style={{
          transform: `translateY(${chipY}px) scale(${refreshing ? 1 : 0.7 + progress * 0.3})`,
          transition: refreshing ? 'transform 0.2s ease' : 'none',
          width: 36, height: 36, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(28,24,36,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(139,92,246,0.35)', boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          opacity: refreshing ? 1 : Math.min(1, progress + 0.25),
        }}
      >
        {refreshing ? (
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#8B5CF6', animation: 'ptr-spin 0.6s linear infinite' }} />
        ) : (
          <Icon name="arrow_downward" size={20} color="#8B5CF6" style={{ transform: progress >= 1 ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
        )}
      </div>
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
