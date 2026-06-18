'use client'
/**
 * Офлайн-страница (/offline).
 *
 * Service Worker отдаёт её как HTML-fallback, когда сеть недоступна, а
 * запрошенной страницы нет в кэше. Самодостаточный экран в стиле проекта:
 * сообщение «нет сети» + «Повторить» (перезагрузка — как только сеть вернётся,
 * запрос пройдёт в обход кэша). Слушаем `online`, чтобы предложить вернуться
 * автоматически.
 */
import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'

export default function OfflinePage() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const sync = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  const retry = () => { if (typeof window !== 'undefined') window.location.reload() }

  return (
    <div style={wrap}>
      <div style={iconWrap}>
        <Icon name="cloud_off" size={32} color="var(--primary-violet)" />
      </div>
      <p style={title}>Нет соединения</p>
      <p style={subtitle}>
        {online
          ? 'Связь восстановлена. Попробуйте обновить страницу.'
          : 'Проверьте подключение к интернету и попробуйте снова.'}
      </p>
      <button style={btn} onClick={retry}>Повторить</button>
    </div>
  )
}

const wrap: React.CSSProperties = {
  minHeight: '100dvh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
  textAlign: 'center', color: 'var(--on-surface)', background: 'var(--bg-base)',
}
const iconWrap: React.CSSProperties = {
  width: 64, height: 64, borderRadius: 18,
  background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
}
const title: React.CSSProperties = { fontSize: 18, fontWeight: 700, margin: 0 }
const subtitle: React.CSSProperties = {
  fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, maxWidth: 300, lineHeight: 1.5,
}
const btn: React.CSSProperties = {
  marginTop: 4, padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700,
}
