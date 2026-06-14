'use client'
/**
 * TITAN AI — ассистент на данных клуба. Открывается из навигации (мобильный FAB на
 * экране Аналитики + кнопка в боковой панели на планшете/десктопе).
 *
 * Раскладка: корень заполняет область контента (flex:1) и НЕ скроллится сам —
 * скроллятся только сообщения внутри чата, а композер прикреплён снизу. Нижний
 * отступ под плавающую навигацию даёт глобальное правило (padding-bottom на корне).
 */
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { TaiLogo } from '@/components/TaiLogo'
import { TitanAiChat } from './TitanAiChat'

export default function TitanAiPage() {
  const router = useRouter()
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Шапка */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => router.back()}
          aria-label="Назад"
          style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0 }}
        >
          <Icon name="arrow_back" size={18} />
        </button>
        <TaiLogo size={40} float={false} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', margin: 0, background: 'linear-gradient(135deg, #a78bfa, #4cd7f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', whiteSpace: 'nowrap' }}>Tai</h1>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '1px 0 0' }}>Ассистент Titan AI на данных клуба</p>
        </div>
      </div>

      <TitanAiChat />
    </div>
  )
}
