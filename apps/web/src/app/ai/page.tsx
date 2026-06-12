'use client'
/**
 * TITAN AI — ассистент на основе данных клуба. Открывается из навигации
 * (мобильный FAB на экране Аналитики + кнопка в боковой панели на планшете/десктопе).
 */
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { AiTab } from '../dashboard/AiTab'

export default function TitanAiPage() {
  const router = useRouter()
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Шапка */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => router.back()}
          aria-label="Назад"
          style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0 }}
        >
          <Icon name="arrow_back" size={18} />
        </button>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 16px rgba(139,92,246,0.4)' }}>
          <Icon name="titan_ai" size={22} color="#fff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', margin: 0, background: 'linear-gradient(135deg, #a78bfa, #4cd7f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', whiteSpace: 'nowrap' }}>TITAN AI</h1>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '1px 0 0' }}>Ассистент на данных клуба</p>
        </div>
      </div>

      {/* Чат */}
      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', flex: 1, maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <AiTab />
      </div>
    </div>
  )
}
