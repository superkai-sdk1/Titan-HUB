'use client'
import { useEffect } from 'react'

/**
 * Фикс «тёмной полосы снизу» в iOS standalone-PWA.
 *
 * Симптом: на запуске под home indicator остаётся тёмная полоса; поворот телефона
 * в ландшафт и обратно — полоса исчезает.
 *
 * Причина: при холодном старте PWA iOS отдаёт веб-вью заниженный вьюпорт и не
 * пересчитывает safe-area/viewport-fit, пока не произойдёт реальная переоценка
 * вьюпорта (как при смене ориентации).
 *
 * Решение: программно воспроизводим переоценку — меняем у мета-вьюпорта
 * viewport-fit=cover → auto, ждём кадр/тик (чтобы iOS успел перелэйаутить под новое
 * значение), затем возвращаем cover. Два реальных изменения значения = две
 * переоценки вьюпорта, как при повороте. Повторяем несколько раз после старта и на
 * каждое реальное изменение вьюпорта.
 */
const VP_BASE = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
const VP_COVER = `${VP_BASE}, viewport-fit=cover`
const VP_AUTO = `${VP_BASE}, viewport-fit=auto`

export function ViewportFix() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
    if (!meta) return

    let t = 0
    const cycle = () => {
      meta.setAttribute('content', VP_AUTO)
      // Реальная пауза, чтобы iOS успел перелэйаутить под auto, затем — обратно cover.
      window.clearTimeout(t)
      t = window.setTimeout(() => meta.setAttribute('content', VP_COVER), 60)
    }

    // iOS «доустаканивает» вьюпорт не мгновенно — повторяем несколько раз после старта.
    const timers = [80, 350, 800, 1500, 2500].map((d) => window.setTimeout(cycle, d))

    window.addEventListener('orientationchange', cycle)
    window.addEventListener('pageshow', cycle)
    document.addEventListener('visibilitychange', cycle)
    window.visualViewport?.addEventListener('resize', cycle)

    return () => {
      timers.forEach(clearTimeout)
      window.clearTimeout(t)
      window.removeEventListener('orientationchange', cycle)
      window.removeEventListener('pageshow', cycle)
      document.removeEventListener('visibilitychange', cycle)
      window.visualViewport?.removeEventListener('resize', cycle)
    }
  }, [])

  return null
}
