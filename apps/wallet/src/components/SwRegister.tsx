'use client'
import { useEffect } from 'react'

/**
 * Регистрация Service Worker для Titan Resident.
 *
 * Воркер лежит в public/ и отдаётся по basePath: /residents/sw.js, скоуп — /residents/.
 * Регистрируем только в браузере и только в проде (в dev/turbopack SW мешает HMR).
 *
 * Управляемое обновление: новый воркер встаёт в waiting и НЕ активируется сам
 * (в sw.js нет безусловного skipWaiting). Когда найден waiting-воркер, шлём ему
 * SKIP_WAITING; по событию controllerchange (воркер сменил контроль над страницей)
 * аккуратно перезагружаем вкладку один раз, чтобы подхватить новую версию оболочки.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    let refreshing = false
    // Перезагрузка ровно один раз при смене контроллера (после SKIP_WAITING).
    const onControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const onLoad = () => {
      navigator.serviceWorker
        .register('/residents/sw.js', { scope: '/residents/' })
        .then((reg) => {
          // Если уже есть готовый к активации воркер — просим активироваться.
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })

          // Новый воркер появился позже (фоновое обновление) — ждём, пока он
          // встанет в installed/waiting, и активируем.
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing
            if (!installing) return
            installing.addEventListener('statechange', () => {
              if (
                installing.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                // controller есть → это апдейт (а не первая установка) → активируем.
                reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
              }
            })
          })
        })
        .catch((err) => console.warn('[sw] register failed:', err))
    }

    if (document.readyState === 'complete') {
      onLoad()
    } else {
      window.addEventListener('load', onLoad)
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      window.removeEventListener('load', onLoad)
    }
  }, [])

  return null
}
