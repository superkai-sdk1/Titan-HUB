'use client'
// ─── /superadmin/clubs/[id] — СТРАНИЦА КЛУБА ──────────────────────────────────
//
// Вкладки: Обзор / Настройки / Подписка и оплаты / Опасная зона.
// Базовые данные (club, modules, subscription) + профиль грузим на маунте;
// сводку (overview) — лениво при открытии вкладки «Обзор».
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { saApi, SaApiError } from '@/lib/superadminApi'
import type { ClubDetailResponse, ClubProfileResponse, ClubOverview } from './../../types'
import { SUB_PERIODS } from './../../types'
import { useSaUnauthorized } from './../../layout'
import {
  GroupedModules,
  VenueProfileForm,
  OwnerSection,
  SubscriptionForm,
  PaymentLinkForm,
  DeleteClub,
  Section,
  MetaItem,
} from './../../clubParts'
import {
  SaPageHeader,
  SaTabs,
  SaBadge,
  SaStatCard,
  SaSpinner,
  SaErrorBanner,
  SaButton,
  subStatusView,
  clubStatusView,
  subscriptionExpiryView,
  fmtDate,
} from './../../ui'

type Tab = 'overview' | 'settings' | 'billing' | 'danger'

const TABS: { key: Tab; label: string; icon?: string }[] = [
  { key: 'overview', label: 'Обзор', icon: 'bar_chart' },
  { key: 'settings', label: 'Настройки', icon: 'settings' },
  { key: 'billing', label: 'Подписка и оплаты', icon: 'payments' },
  { key: 'danger', label: 'Опасная зона', icon: 'warning' },
]

export default function ClubPage() {
  const router = useRouter()
  const params = useParams()
  const id = String(params.id)
  const signalUnauthorized = useSaUnauthorized()

  const [detail, setDetail] = useState<ClubDetailResponse | null>(null)
  const [profile, setProfile] = useState<ClubProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')

  // Сводка (overview) — ленивая, отдельный статус: грузим при первой вкладке.
  const [overview, setOverview] = useState<ClubOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewFailed, setOverviewFailed] = useState(false)

  const handle401 = useCallback(
    (e: unknown): boolean => {
      if (e instanceof SaApiError && e.status === 401) {
        signalUnauthorized()
        return true
      }
      return false
    },
    [signalUnauthorized],
  )

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        saApi.get<ClubDetailResponse>(`/clubs/${id}`),
        saApi.get<ClubProfileResponse>(`/clubs/${id}/profile`),
      ])
      setDetail(d)
      setProfile(p)
    } catch (e) {
      if (handle401(e)) return
      setError(e instanceof SaApiError ? e.message : 'Не удалось загрузить заведение')
    } finally {
      setLoading(false)
    }
  }, [id, handle401])

  const reload = useCallback(() => {
    void load()
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  // Ленивая загрузка сводки при открытии вкладки «Обзор» (один раз).
  useEffect(() => {
    if (tab !== 'overview' || overview || overviewLoading || overviewFailed) return
    let alive = true
    setOverviewLoading(true)
    ;(async () => {
      try {
        const ov = await saApi.get<ClubOverview>(`/clubs/${id}/overview`)
        if (!alive) return
        setOverview(ov)
      } catch (e) {
        if (!alive) return
        if (handle401(e)) return
        // 502/прочее — мягкая заглушка, не рушим страницу.
        setOverviewFailed(true)
      } finally {
        if (alive) setOverviewLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [tab, id, overview, overviewLoading, overviewFailed, handle401])

  if (loading) return <SaSpinner label="Загрузка заведения…" />

  if (error || !detail) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SaErrorBanner message={error || 'Заведение не найдено'} />
        <SaButton icon="chevron_left" onClick={() => router.push('/superadmin')} style={{ width: 'auto' }}>
          Назад
        </SaButton>
      </div>
    )
  }

  const { club, modules, subscription } = detail
  const cStatus = clubStatusView(club.status)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SaPageHeader
        onBack={() => router.push('/superadmin')}
        title={club.name}
        subtitle={`${club.slug} · ${club.subdomain ?? '—'}`}
        right={<SaBadge tone={cStatus.tone}>{cStatus.label}</SaBadge>}
      />

      <SaTabs<Tab> tabs={TABS} active={tab} onChange={setTab} />

      {/* ─── Обзор ─── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {overviewLoading ? (
            <SaSpinner label="Загрузка статистики…" />
          ) : overview ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              <SaStatCard icon="payments" label="Выручка сегодня" value={`${overview.today.revenue.toLocaleString('ru')} ₽`} tone="violet" />
              <SaStatCard icon="bar_chart" label="Чеков сегодня" value={overview.today.checks} tone="neutral" />
              <SaStatCard icon="payments" label="Выручка за месяц" value={`${overview.month.revenue.toLocaleString('ru')} ₽`} tone="ok" />
              <SaStatCard icon="bar_chart" label="Открытых чеков" value={overview.openChecks} tone="warn" />
              <SaStatCard icon="person" label="Клиентов" value={overview.clients} tone="neutral" />
              <SaStatCard icon="person" label="Сотрудников" value={overview.staff} tone="neutral" />
              <SaStatCard icon="schedule" label="Смена" value={overview.shiftOpen ? 'Открыта' : 'Закрыта'} tone={overview.shiftOpen ? 'ok' : 'neutral'} />
              <SaStatCard icon="schedule" label="Последняя активность" value={fmtDate(overview.lastActivity)} tone="neutral" />
            </div>
          ) : (
            <div
              className="glass-l2"
              style={{ borderRadius: 18, padding: '24px', display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.5)' }}
            >
              <Icon name="warning" size={20} color="#FBBF24" />
              <span style={{ fontSize: 14 }}>Статистика недоступна</span>
            </div>
          )}

          <Section title="О заведении">
            <div className="glass-l2" style={{ borderRadius: 18, padding: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {club.subdomain ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="link" size={16} color="rgba(167,139,250,0.7)" />
                  <div>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Поддомен</p>
                    <a
                      href={`https://${club.subdomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, color: '#A78BFA', margin: '1px 0 0', fontWeight: 600, textDecoration: 'none' }}
                    >
                      {club.subdomain}
                    </a>
                  </div>
                </div>
              ) : (
                <MetaItem icon="link" label="Поддомен" value="—" />
              )}
              <MetaItem icon="store" label="База данных" value={club.dbName} />
              <MetaItem icon="schedule" label="Создан" value={fmtDate(club.createdAt)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="payments" size={16} color="rgba(167,139,250,0.7)" />
                <div>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Подписка</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <SaBadge tone={subStatusView(subscription?.status).tone}>{subStatusView(subscription?.status).label}</SaBadge>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>до {fmtDate(subscription?.paidUntil)}</span>
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ─── Настройки ─── */}
      {tab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Section title="Профиль заведения">
            <VenueProfileForm clubId={id} profile={profile?.profile ?? null} onSaved={reload} />
          </Section>
          <Section title="Владелец">
            <OwnerSection clubId={id} owners={profile?.owners ?? []} onChanged={reload} />
          </Section>
          <Section title="Модули">
            <GroupedModules clubId={id} modules={modules} onChanged={reload} />
          </Section>
        </div>
      )}

      {/* ─── Подписка и оплаты ─── */}
      {tab === 'billing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Section title="Текущая подписка">
            <div className="glass-l2" style={{ borderRadius: 18, padding: '18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <SaBadge tone={subStatusView(subscription?.status).tone}>{subStatusView(subscription?.status).label}</SaBadge>
                <SaBadge tone={subscriptionExpiryView(subscription?.paidUntil, subscription?.status).tone}>
                  {subscriptionExpiryView(subscription?.paidUntil, subscription?.status).label}
                </SaBadge>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                <div>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Период</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: '3px 0 0' }}>
                    {SUB_PERIODS.find((p) => p.value === subscription?.period)?.label ?? subscription?.period ?? '—'}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Оплачено до</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: '3px 0 0' }}>
                    {fmtDate(subscription?.paidUntil)}
                  </p>
                </div>
              </div>
            </div>
          </Section>
          <Section title="Продлить вручную">
            <SubscriptionForm clubId={id} onSaved={reload} />
          </Section>
          <Section title="Ссылка на оплату (Platega)">
            <PaymentLinkForm clubId={id} />
          </Section>
        </div>
      )}

      {/* ─── Опасная зона ─── */}
      {tab === 'danger' && (
        <Section title="Удаление">
          <DeleteClub clubId={id} clubName={club.name} onDeleted={() => router.push('/superadmin')} />
        </Section>
      )}
    </div>
  )
}
