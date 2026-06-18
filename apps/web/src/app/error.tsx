'use client'
/**
 * Корневой route-level error boundary (Next.js App Router).
 *
 * Ловит ошибку рендера сегмента, НЕ роняя всё приложение и НЕ делая
 * location.reload() (это выкидывало из активного чека). Даёт «Повторить»
 * через reset() — пересборку сегмента без полной перезагрузки.
 *
 * Особый случай — ChunkLoadError: после деплоя старая вкладка тянет уже
 * несуществующий чанк. Тут reset() не поможет (код устарел) — предлагаем
 * обновить страницу, чтобы подтянуть свежий бандл (совместно с управляемым SW).
 */
import { useEffect } from 'react'

// Ошибка устаревшего/недоступного JS-чанка (типична после деплоя у старой вкладки).
function isChunkLoadError(error: Error): boolean {
  const name = error?.name ?? ''
  const msg = error?.message ?? ''
  return name === 'ChunkLoadError'
    || /Loading chunk [\w-]+ failed/i.test(msg)
    || /Loading CSS chunk/i.test(msg)
    || /import\(\) failed/i.test(msg)
}

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunk = isChunkLoadError(error)

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Route error boundary:', error)
  }, [error])

  const reload = () => { if (typeof window !== 'undefined') window.location.reload() }

  return (
    <div style={wrap}>
      <p style={title}>{chunk ? 'Доступно обновление' : 'Что-то пошло не так'}</p>
      <p style={subtitle}>
        {chunk
          ? 'Приложение обновилось. Перезагрузите страницу, чтобы загрузить новую версию.'
          : 'Произошла ошибка интерфейса. Можно повторить — остальное приложение продолжит работать.'}
      </p>
      <button style={btn} onClick={chunk ? reload : reset}>
        {chunk ? 'Обновить' : 'Повторить'}
      </button>
    </div>
  )
}

const wrap: React.CSSProperties = {
  minHeight: '60dvh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
  textAlign: 'center', color: 'var(--on-surface)',
}
const title: React.CSSProperties = { fontSize: 16, fontWeight: 700, margin: 0 }
const subtitle: React.CSSProperties = {
  fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, maxWidth: 320, lineHeight: 1.5,
}
const btn: React.CSSProperties = {
  padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700,
}
