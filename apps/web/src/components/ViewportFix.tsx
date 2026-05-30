'use client'
import { useEffect } from 'react'

/**
 * Фикс «тёмной полосы снизу» в iOS standalone-PWA.
 *
 * Симптом: на запуске под home indicator остаётся тёмная полоса; стоит повернуть
 * телефон в ландшафт и обратно — полоса исчезает и всё корректно.
 *
 * Причина: при холодном старте PWA iOS отдаёт веб-вью ЗАНИЖЕННУЮ высоту вьюпорта
 * (без нижней safe-area), и `height:100dvh` фиксируется на этом значении. Когда
 * система «доустаканивает» вьюпорт, авто-пересчёта не происходит (мешает жёсткий
 * height + overflow:hidden), поэтому низ не докрашивается. Поворот экрана шлёт
 * resize/orientationchange — WebKit пересчитывает dvh и полоса уходит.
 *
 * Решение: programmatically повторяем этот пересчёт — несколько раз после запуска
 * (пока вьюпорт устаканивается) и на каждое реальное изменение вьюпорта «нуджим»
 * высоту корня (ставим px от innerHeight и в следующем кадре возвращаем к 100dvh),
 * что форсирует релейаут против АКТУАЛЬНОГО вьюпорта — как при повороте.
 */
export function ViewportFix() {
  useEffect(() => {
    const el = document.documentElement
    let raf = 0

    const relayout = () => {
      cancelAnimationFrame(raf)
      const h = (window.visualViewport?.height ?? window.innerHeight)
      if (h > 0) {
        // Нудж к измеренной высоте — форсирует пересчёт layout/safe-area.
        el.style.height = `${h}px`
        raf = requestAnimationFrame(() => {
          // Возврат к CSS-значению (100dvh) — теперь оно пересчитывается верно.
          el.style.height = ''
        })
      }
    }

    // iOS «доустаканивает» вьюпорт не мгновенно — повторяем несколько раз.
    const timers = [0, 80, 250, 600, 1200].map((d) => window.setTimeout(relayout, d))

    window.addEventListener('orientationchange', relayout)
    window.addEventListener('pageshow', relayout)
    window.addEventListener('focus', relayout)
    document.addEventListener('visibilitychange', relayout)
    window.visualViewport?.addEventListener('resize', relayout)

    return () => {
      timers.forEach(clearTimeout)
      cancelAnimationFrame(raf)
      window.removeEventListener('orientationchange', relayout)
      window.removeEventListener('pageshow', relayout)
      window.removeEventListener('focus', relayout)
      document.removeEventListener('visibilitychange', relayout)
      window.visualViewport?.removeEventListener('resize', relayout)
    }
  }, [])

  return null
}
