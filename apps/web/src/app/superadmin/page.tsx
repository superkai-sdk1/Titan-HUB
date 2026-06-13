'use client'
// ─── /superadmin — ДАШБОРД платформы ──────────────────────────────────────────
//
// Auth-гейт и шелл живут в layout.tsx. Здесь — только сама дашборд-страница:
// сводка по платформе (карточки), список заведений с поиском и сортировкой
// «требующие внимания — вверх», блок последних платежей.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { saApi, SaApiError } from '@/lib/superadminApi'
import type { PlatformOverview, ClubsResponse, ClubListItem } from './types'
import { useSaUnauthorized } from './layout'
import {
  SaInput,
  SaPrimaryButton,
  SaStatCard,
  SaBadge,
  SaSpinner,
  SaErrorBanner,
  clubStatusView,
  subStatusView,
  subscriptionExpiryView,
  fmtDate,
} from './ui'

// Метод платежа → русская подпись.
function paymentMethodLabel(method: string): string {
  if (method === 'manual') return 'Вручную'
  if (method === 'platega') return 'Platega'
  return method
}

export default function SuperadminDashboardPage() {
  const router = useRouter()
  const signalUnauthorized = useSaUnauthorized()
  const [overview, setOverview] = useState<PlatformOverview | null>(null)
  const [clubs, setClubs] = useState<ClubListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [ov, cl] = await Promise.all([
          saApi.get<PlatformOverview>('/overview'),
          saApi.get<ClubsResponse>('/clubs'),
        ])
        if (!alive) return
        setOverview(ov)
        setClubs(cl.clubs)
      } catch (e) {
        if (!alive) return
        if (e instanceof SaApiError && e.status === 401) {
          signalUnauthorized()
          return
        }
        setError(e instanceof SaApiError ? e.message : 'Не удалось загрузить данные')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [signalUnauthorized])

  // Фильтр (по name/slug) + сортировка: требующие внимания (warn/danger) — вверх.
  const visibleClubs = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? clubs.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
      : clubs
    const weight = (c: ClubListItem) => {
      const tone = subscriptionExpiryView(c.subPaidUntil, c.subStatus).tone
      if (tone === 'danger') return 0
      if (tone === 'warn') return 1
      return 2
    }
    return [...filtered].sort((a, b) => weight(a) - weight(b))
  }, [clubs, query])

  if (loading) return <SaSpinner label="Загрузка платформы…" />

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SaErrorBanner message={error} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Сводка платформы */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          <SaStatCard icon="store" label="Всего заведений" value={overview.clubs.total} tone="violet" />
          <SaStatCard icon="check_circle" label="Активные" value={overview.clubs.active} tone="ok" />
          <SaStatCard icon="schedule" label="Истекают ≤7 дн" value={overview.subscriptions.expiringSoon} tone="warn" />
          <SaStatCard icon="warning" label="Просрочены" value={overview.subscriptions.overdue} tone="danger" />
          <SaStatCard icon="schedule" label="Триал" value={overview.clubs.trial} tone="warn" />
          <SaStatCard icon="payments" label="Доход за месяц" value={`${overview.revenueMonth.toLocaleString('ru')} ₽`} tone="violet" />
        </div>
      )}

      {/* Заведения */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.95)' }}>
            Заведения
          </h2>
          <SaPrimaryButton icon="add" onClick={() => router.push('/superadmin/new')} style={{ width: 'auto', padding: '11px 18px' }}>
            Создать заведение
          </SaPrimaryButton>
        </div>

        {clubs.length === 0 ? (
          // Пустое состояние.
          <div
            className="glass-l2"
            style={{
              borderRadius: 18,
              padding: '48px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              textAlign: 'center',
            }}
          >
            <Icon name="store" size={44} color="rgba(167,139,250,0.6)" />
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'rgba(255,255,255,0.9)' }}>Пока нет заведений</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '4px 0 0' }}>
                Создайте первое заведение, чтобы начать работу.
              </p>
            </div>
            <SaPrimaryButton icon="add" onClick={() => router.push('/superadmin/new')} style={{ width: 'auto', padding: '12px 20px' }}>
              Создать заведение
            </SaPrimaryButton>
          </div>
        ) : (
          <>
            <SaInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию или slug…"
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {visibleClubs.map((club) => {
                const cStatus = clubStatusView(club.status)
                const sStatus = subStatusView(club.subStatus)
                const expiry = subscriptionExpiryView(club.subPaidUntil, club.subStatus)
                return (
                  <div
                    key={club.id}
                    className="glass-l2"
                    onClick={() => router.push(`/superadmin/clubs/${club.id}`)}
                    style={{
                      borderRadius: 18,
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 11,
                          background: 'rgba(139,92,246,0.14)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon name="store" size={20} color="#A78BFA" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'rgba(255,255,255,0.95)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {club.name}
                        </p>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0', fontFamily: "'JetBrains Mono',monospace" }}>
                          {club.slug}
                        </p>
                      </div>
                    </div>

                    {club.subdomain && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.5)' }}>
                        <Icon name="link" size={14} color="rgba(167,139,250,0.7)" />
                        <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {club.subdomain}
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <SaBadge tone={cStatus.tone}>{cStatus.label}</SaBadge>
                      <SaBadge tone={sStatus.tone}>{sStatus.label}</SaBadge>
                      <SaBadge tone={expiry.tone}>{expiry.label}</SaBadge>
                    </div>

                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                      Оплачено до {fmtDate(club.subPaidUntil)}
                    </p>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Последние платежи */}
      {overview && overview.recentPayments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.95)' }}>
            Последние платежи
          </h2>
          <div className="glass-l2" style={{ borderRadius: 18, padding: '8px 6px', display: 'flex', flexDirection: 'column' }}>
            {overview.recentPayments.map((p, i) => (
              <div
                key={`${p.clubId}-${p.paidAt}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '11px 14px',
                  borderBottom: i < overview.recentPayments.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.clubName ?? '—'}
                  </p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>
                    {paymentMethodLabel(p.method)}
                    {p.period ? ` · ${p.period}` : ''} · {fmtDate(p.paidAt)}
                  </p>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#34D399', whiteSpace: 'nowrap' }}>
                  {p.amount ? `${Number(p.amount).toLocaleString('ru')} ₽` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
