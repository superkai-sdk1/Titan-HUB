'use client'
import { useEffect } from 'react'

/**
 * Фикс «тёмной полосы снизу» в iOS standalone-PWA.
 *
 * Симптом: на запуске под home indicator остаётся тёмная полоса; стоит повернуть
 * телефон в ландшафт и обратно — полоса исчезает и всё корректно.
 *
 * Причина: при холодном старте PWA iOS отдаёт веб-вью ЗАНИЖЕННУЮ высоту вьюпорта и
 * не пересчитывает safe-area/viewport-fit, пока не произойдёт реальная переоценка
 * вьюпорта (как при смене ориентации). Простой пересчёт layout не помогает — нужно
 * заставить WebKit ПЕРЕОЦЕНИТЬ сам вьюпорт.
 *
 * Решение: программно «перетряхиваем» мета-вьюпорт — на короткое время меняем
 * viewport-fit=cover → auto и обратно. Смена значения заставляет WebKit заново
 * вычислить вьюпорт и safe-area-insets — ровно то, что делает поворот экрана.
 * Делаем это несколько раз после старта (пока система устаканивает вьюпорт) и на
 * каждое реальное изменение вьюпорта. Доп. страховка — нудж высоты корня.
 */
const VP_COVER = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
const VP_AUTO = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=auto'

export function ViewportFix() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
    const el = document.documentElement
    let raf = 0

    const reevaluate = () => {
      cancelAnimationFrame(raf)
      if (meta) {
        // Смена viewport-fit форсирует переоценку вьюпорта и safe-area (как поворот).
        meta.setAttribute('content', VP_AUTO)
      }
      // Нудж высоты корня — дополнительный форс релейаута.
      const h = window.visualViewport?.height ?? window.innerHeight
      if (h > 0) el.style.height = `${h}px`

      raf = requestAnimationFrame(() => {
        if (meta) meta.setAttribute('content', VP_COVER)
        el.style.height = ''
      })
    }

    // iOS «доустаканивает» вьюпорт не мгновенно — повторяем несколько раз после старта.
    const timers = [0, 100, 300, 700, 1400].map((d) => window.setTimeout(reevaluate, d))

    window.addEventListener('orientationchange', reevaluate)
    window.addEventListener('pageshow', reevaluate)
    document.addEventListener('visibilitychange', reevaluate)
    window.visualViewport?.addEventListener('resize', reevaluate)

    return () => {
      timers.forEach(clearTimeout)
      cancelAnimationFrame(raf)
      window.removeEventListener('orientationchange', reevaluate)
      window.removeEventListener('pageshow', reevaluate)
      document.removeEventListener('visibilitychange', reevaluate)
      window.visualViewport?.removeEventListener('resize', reevaluate)
    }
  }, [])

  return null
}
