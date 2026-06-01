'use client'
import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/manage/DesignSystem'

const LBL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: 'var(--on-surface-variant)',
  margin: '0 0 6px',
  display: 'block',
}

const VAL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: 13,
  color: 'var(--on-surface)',
  margin: 0,
}

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 16,
  padding: '20px 24px',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}

const CARD_INNER: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '14px 18px',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}

interface SystemInfo {
  version: string
  shift: { id: string } | null
  eveningName?: string | null
  env?: string
}

// Версия приложения = версия активного Service Worker. Читаем из имён его кэшей
// (titan-static-vNNN / titan-runtime-vNNN), это отражает реально установленную на
// устройстве версию.
function useServiceWorkerVersion(): string | null {
  const [v, setV] = useState<string | null>(null)
  useEffect(() => {
    if (typeof caches === 'undefined') return
    let active = true
    caches.keys().then((keys) => {
      if (!active) return
      const k = keys.find((k) => /^titan-(static|runtime)-/.test(k))
      if (k) setV(k.replace(/^titan-(static|runtime)-/, ''))
    }).catch(() => { /* нет доступа к caches */ })
    return () => { active = false }
  }, [])
  return v
}

export default function AboutPage() {
  const { data, isLoading, isError, refetch } = useQuery<SystemInfo>({
    queryKey: ['system', 'info'],
    queryFn: () => api.get<SystemInfo>('/system/info'),
    refetchInterval: false,
  })
  const swVersion = useServiceWorkerVersion()
  const info = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader title="О системе" subtitle="Информация о версии и состоянии системы" />
      <div style={{ padding: '20px 16px var(--bottom-nav-clear, 24px)', maxWidth: 720, margin: '0 auto', width: '100%' }}>

        {/* Версия приложения */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Icon name="info" size={20} color="#8B5CF6" />
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--on-surface)' }}>
              О приложении
            </span>
          </div>

          {isLoading && (
            <div style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>Загрузка...</div>
          )}
          {isError && (
            <div style={{ color: '#f87171', fontSize: 13 }}>Ошибка загрузки данных</div>
          )}

          {info && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {/* Окружение */}
              <div style={CARD_INNER}>
                <span style={LBL}>Окружение</span>
                <p style={VAL}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: info.env === 'production' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                    color: info.env === 'production' ? '#4ade80' : '#fbbf24',
                    border: `1px solid ${info.env === 'production' ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`,
                  }}>
                    {info.env ?? 'development'}
                  </span>
                </p>
              </div>

              {/* Смена + название вечера */}
              <div style={CARD_INNER}>
                <span style={LBL}>Смена</span>
                <p style={{ ...VAL, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: info.shift ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                    color: info.shift ? '#4ade80' : 'var(--on-surface-variant)',
                    border: `1px solid ${info.shift ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  }}>
                    {info.shift ? 'Открыта' : 'Закрыта'}
                  </span>
                  {info.shift && info.eveningName && (
                    <span style={{ color: 'var(--on-surface)' }}>{info.eveningName}</span>
                  )}
                </p>
              </div>

              {/* Версия приложения (Service Worker) */}
              <div style={CARD_INNER}>
                <span style={LBL}>Версия приложения</span>
                <p style={{ ...VAL, fontSize: 18, fontWeight: 700, color: '#8B5CF6' }}>
                  {swVersion ?? '—'}
                </p>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--on-surface)', fontSize: 13, fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.6 : 1, transition: 'all 0.2s',
              }}
            >
              <Icon name="refresh" size={16} />
              Обновить
            </button>
          </div>
        </div>

        {/* Документы */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Icon name="description" size={20} color="#a78bfa" />
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--on-surface)' }}>
              Документы
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href="https://titanpos.ru/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...CARD_INNER, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="privacy_tip" size={18} color="#a78bfa" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>Политика конфиденциальности</p>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>titanpos.ru/privacy</p>
              </div>
              <Icon name="open_in_new" size={18} color="var(--on-surface-variant)" />
            </a>

            <a
              href="https://titanpos.ru/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...CARD_INNER, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(76,215,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(76,215,246,0.3)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(76,215,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="gavel" size={18} color="#4cd7f6" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--on-surface)' }}>Пользовательское соглашение</p>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>titanpos.ru/terms</p>
              </div>
              <Icon name="open_in_new" size={18} color="var(--on-surface-variant)" />
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
