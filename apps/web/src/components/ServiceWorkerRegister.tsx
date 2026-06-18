'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Регистрирует Service Worker и управляет ОБНОВЛЕНИЕМ PWA «по воле кассира».
 *
 * Поток обновления (вместо безусловного skipWaiting, который ронял открытый чек
 * ChunkLoadError'ом во время деплоя):
 *   1. Браузер находит новый sw.js → у регистрации появляется `waiting`-воркер
 *      (или `installing` → ждём, пока станет `installed`). Старый воркер
 *      продолжает контролировать вкладку — активный чек НЕ трогается.
 *   2. Показываем неблокирующую плашку «Доступно обновление» с кнопкой.
 *   3. По клику шлём waiting-воркеру {type:'SKIP_WAITING'} → он активируется.
 *   4. `controllerchange` (новый воркер забрал управление) → один reload.
 *      Двойной reload защищён флагом refreshingRef.
 */
export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const refreshingRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    let reg: ServiceWorkerRegistration | null = null

    // Новый воркер забрал управление → перезагружаемся ровно один раз.
    const onControllerChange = () => {
      if (refreshingRef.current) return
      refreshingRef.current = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    // Воркер «installed» при уже активном контроллере = доступно обновление.
    const trackInstalling = (sw: ServiceWorker) => {
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          setWaiting(sw)
        }
      })
    }

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          reg = registration

          // Уже есть готовый к активации воркер (вкладка жила во время деплоя).
          if (registration.waiting && navigator.serviceWorker.controller) {
            setWaiting(registration.waiting)
          }

          // Появился новый воркер — следим за его установкой.
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing
            if (installing) trackInstalling(installing)
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

  const applyUpdate = () => {
    if (!waiting) return
    // Воркер активируется → пришлёт controllerchange → reload.
    waiting.postMessage({ type: 'SKIP_WAITING' })
    setWaiting(null)
  }

  if (!waiting) return null

  return <UpdateBanner onUpdate={applyUpdate} onDismiss={() => setWaiting(null)} />
}

/**
 * Неблокирующая плашка обновления. Inline-стили под дизайн-систему («тихая
 * роскошь», violet-акцент, blur), над нижней навигацией. Кассир дочиняет чек и
 * обновляется сам — без принудительного перехвата вкладки.
 */
function UpdateBanner({ onUpdate, onDismiss }: { onUpdate: () => void; onDismiss: () => void }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 'calc(var(--bottom-nav-clear, 96px) + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        width: 'min(calc(100vw - 32px), 380px)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 12px 12px 16px',
        background: 'rgba(139, 92, 246, 0.14)',
        border: '1px solid rgba(139, 92, 246, 0.35)',
        borderRadius: 16,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 6px 26px rgba(0,0,0,0.34)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)' }}>
          Доступно обновление
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', marginTop: 1 }}>
          Обновите, когда закончите текущий чек
        </div>
      </div>
      <button
        onClick={onUpdate}
        style={{
          flexShrink: 0,
          padding: '8px 16px',
          borderRadius: 12,
          border: 'none',
          cursor: 'pointer',
          background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Обновить
      </button>
      <button
        onClick={onDismiss}
        aria-label="Позже"
        style={{
          flexShrink: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--on-surface-variant)',
          fontSize: 18,
          lineHeight: 1,
          padding: '4px 6px',
        }}
      >
        ×
      </button>
    </div>
  )
}
