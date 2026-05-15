'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

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
  staffCount: number
  env?: string
  gitHash?: string
  gitBranch?: string
  behindCount?: number
  buildDate?: string
  nodeVersion?: string
}

interface UpdateStep {
  step: string
  status: 'pending' | 'running' | 'done' | 'error'
  message?: string
}

const UPDATE_STEPS = [
  { key: 'git_clean', label: 'git clean' },
  { key: 'git_fetch', label: 'git fetch' },
  { key: 'git_reset', label: 'git reset' },
  { key: 'npm_ci', label: 'npm ci' },
  { key: 'check_env', label: 'check .env' },
  { key: 'build', label: 'npm run build' },
  { key: 'build_wallet', label: 'npm run build:wallet' },
]

export default function AboutPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isOwner = user?.role === 'owner'

  const [updateSteps, setUpdateSteps] = useState<UpdateStep[]>([])
  const [updateRunning, setUpdateRunning] = useState(false)
  const [updateDone, setUpdateDone] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<SystemInfo>({
    queryKey: ['system', 'info'],
    queryFn: () => api.get<SystemInfo>('/system/info'),
    refetchInterval: false,
  })

  function handleCheckUpdates() {
    refetch()
  }

  function handleRunUpdate() {
    if (!isOwner || updateRunning) return

    setUpdateRunning(true)
    setUpdateDone(false)
    setUpdateError(null)
    setUpdateSteps(UPDATE_STEPS.map((s) => ({ step: s.key, status: 'pending' })))

    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/system/update-run`
    )

    eventSource.addEventListener('step_start', (e) => {
      try {
        const d = JSON.parse(e.data)
        setUpdateSteps((prev) =>
          prev.map((s) => (s.step === d.step ? { ...s, status: 'running' } : s))
        )
      } catch {}
    })

    eventSource.addEventListener('step_done', (e) => {
      try {
        const d = JSON.parse(e.data)
        setUpdateSteps((prev) =>
          prev.map((s) => (s.step === d.step ? { ...s, status: 'done' } : s))
        )
      } catch {}
    })

    eventSource.addEventListener('step_error', (e) => {
      try {
        const d = JSON.parse(e.data)
        setUpdateSteps((prev) =>
          prev.map((s) => (s.step === d.step ? { ...s, status: 'error', message: d.message } : s))
        )
      } catch {}
    })

    eventSource.addEventListener('complete', () => {
      setUpdateRunning(false)
      setUpdateDone(true)
      eventSource.close()
      qc.invalidateQueries({ queryKey: ['system', 'info'] })
    })

    eventSource.addEventListener('error_fatal', (e) => {
      try {
        const d = JSON.parse(e.data)
        setUpdateError(d.message ?? 'Ошибка обновления')
      } catch {
        setUpdateError('Ошибка обновления')
      }
      setUpdateRunning(false)
      eventSource.close()
    })

    eventSource.onerror = () => {
      setUpdateRunning(false)
      setUpdateError('Эндпоинт обновления недоступен')
      eventSource.close()
    }
  }

  const info = data

  return (
    <div style={{ padding: '24px 20px', maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          О системе
        </h1>
        <p style={{ color: 'var(--on-surface-variant)', fontSize: 14, margin: '6px 0 0' }}>
          Информация о версии и состоянии системы
        </p>
      </div>

      {/* Version Card */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: '#8B5CF6' }}
          >
            info
          </span>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--on-surface)' }}>
            Версия приложения
          </span>
        </div>

        {isLoading && (
          <div style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>Загрузка...</div>
        )}
        {isError && (
          <div style={{ color: '#f87171', fontSize: 13 }}>Ошибка загрузки данных</div>
        )}

        {info && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            <div style={CARD_INNER}>
              <span style={LBL}>Версия</span>
              <p style={{ ...VAL, fontSize: 18, fontWeight: 700, color: '#8B5CF6' }}>
                v{info.version}
              </p>
            </div>

            <div style={CARD_INNER}>
              <span style={LBL}>Окружение</span>
              <p style={VAL}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background:
                      info.env === 'production'
                        ? 'rgba(34,197,94,0.15)'
                        : 'rgba(251,191,36,0.15)',
                    color: info.env === 'production' ? '#4ade80' : '#fbbf24',
                    border: `1px solid ${info.env === 'production' ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`,
                  }}
                >
                  {info.env ?? 'development'}
                </span>
              </p>
            </div>

            {info.nodeVersion && (
              <div style={CARD_INNER}>
                <span style={LBL}>Node.js</span>
                <p style={VAL}>{info.nodeVersion}</p>
              </div>
            )}

            <div style={CARD_INNER}>
              <span style={LBL}>Смена</span>
              <p style={VAL}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background: info.shift
                      ? 'rgba(34,197,94,0.15)'
                      : 'rgba(255,255,255,0.06)',
                    color: info.shift ? '#4ade80' : 'var(--on-surface-variant)',
                    border: `1px solid ${info.shift ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  {info.shift ? 'Открыта' : 'Закрыта'}
                </span>
              </p>
            </div>

            <div style={CARD_INNER}>
              <span style={LBL}>Сотрудников</span>
              <p style={{ ...VAL, fontSize: 18, fontWeight: 700 }}>{info.staffCount}</p>
            </div>
          </div>
        )}
      </div>

      {/* Git Info Card */}
      <div style={{ ...CARD, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: '#4cd7f6' }}
          >
            commit
          </span>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--on-surface)' }}>
            Git
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          <div style={CARD_INNER}>
            <span style={LBL}>Хеш коммита</span>
            <p style={VAL}>{info?.gitHash ?? '—'}</p>
          </div>

          <div style={CARD_INNER}>
            <span style={LBL}>Ветка</span>
            <p style={VAL}>{info?.gitBranch ?? '—'}</p>
          </div>

          <div style={CARD_INNER}>
            <span style={LBL}>Отстаёт на</span>
            <p style={VAL}>
              {info?.behindCount != null ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: info.behindCount > 0 ? '#fbbf24' : '#4ade80',
                  }}
                >
                  {info.behindCount > 0 && (
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      arrow_downward
                    </span>
                  )}
                  {info.behindCount === 0 ? 'Актуально' : `${info.behindCount} коммитов`}
                </span>
              ) : (
                '—'
              )}
            </p>
          </div>

          {info?.buildDate && (
            <div style={CARD_INNER}>
              <span style={LBL}>Дата сборки</span>
              <p style={VAL}>
                {new Date(info.buildDate).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={handleCheckUpdates}
          disabled={isLoading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--on-surface)',
            fontSize: 13,
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            refresh
          </span>
          Проверить обновления
        </button>

        {isOwner && (
          <button
            onClick={handleRunUpdate}
            disabled={updateRunning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              background: updateRunning
                ? 'rgba(255,255,255,0.04)'
                : 'rgba(239,68,68,0.1)',
              border: updateRunning
                ? '1px solid rgba(255,255,255,0.1)'
                : '1px solid rgba(239,68,68,0.4)',
              color: updateRunning ? 'var(--on-surface-variant)' : '#f87171',
              fontSize: 13,
              fontWeight: 600,
              cursor: updateRunning ? 'not-allowed' : 'pointer',
              opacity: updateRunning ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {updateRunning ? 'hourglass_top' : 'system_update_alt'}
            </span>
            {updateRunning ? 'Обновление...' : 'Запустить обновление'}
          </button>
        )}
      </div>

      {/* Update Progress */}
      {updateSteps.length > 0 && (
        <div style={{ ...CARD, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 20, color: '#fbbf24' }}
            >
              update
            </span>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--on-surface)' }}>
              Прогресс обновления
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {UPDATE_STEPS.map((stepDef, i) => {
              const step = updateSteps[i]
              const status = step?.status ?? 'pending'
              return (
                <div
                  key={stepDef.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background:
                      status === 'running'
                        ? 'rgba(251,191,36,0.08)'
                        : status === 'done'
                        ? 'rgba(34,197,94,0.08)'
                        : status === 'error'
                        ? 'rgba(239,68,68,0.08)'
                        : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${
                      status === 'running'
                        ? 'rgba(251,191,36,0.2)'
                        : status === 'done'
                        ? 'rgba(34,197,94,0.2)'
                        : status === 'error'
                        ? 'rgba(239,68,68,0.2)'
                        : 'rgba(255,255,255,0.06)'
                    }`,
                    transition: 'all 0.3s',
                  }}
                >
                  {status === 'running' ? (
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 16,
                        color: '#fbbf24',
                        animation: 'spin 1s linear infinite',
                      }}
                    >
                      progress_activity
                    </span>
                  ) : status === 'done' ? (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 16, color: '#4ade80' }}
                    >
                      check_circle
                    </span>
                  ) : status === 'error' ? (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 16, color: '#f87171' }}
                    >
                      cancel
                    </span>
                  ) : (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 16, color: 'rgba(255,255,255,0.2)' }}
                    >
                      radio_button_unchecked
                    </span>
                  )}

                  <span
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 12,
                      color:
                        status === 'pending'
                          ? 'var(--on-surface-variant)'
                          : 'var(--on-surface)',
                    }}
                  >
                    {stepDef.label}
                  </span>

                  {step?.message && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#f87171',
                        marginLeft: 'auto',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {step.message}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {updateDone && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(74,222,128,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#4ade80',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                check_circle
              </span>
              Обновление завершено
            </div>
          )}

          {updateError && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#f87171',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                error
              </span>
              {updateError}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
