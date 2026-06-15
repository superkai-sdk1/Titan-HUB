'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { PageHeader, Sheet, Button, ConfirmDialog, INP, LBL, Toggle, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

// ─── Типы доменных сущностей ─────────────────────────────────────────────────
interface Tariff {
  id: string
  name: string
  key?: string | null
  isSystem?: boolean
  price: string | number
  color: string | null
  sortOrder?: number
  isActive: boolean
  itemId?: string | null
}
interface EveningType {
  key: string
  label: string
  color: string | null
  sortOrder?: number
  isSystem?: boolean
}
interface Space {
  id: string
  name: string
  type: string
  hourlyRate: string | number
  capacity?: number | null
  isActive?: boolean
}
interface EventRate {
  hours: number
  price: string | number
}

type Tab = 'tariffs' | 'evenings' | 'rental' | 'events'

// Палитра для выбора цвета тарифа/типа вечера.
const COLOR_PALETTE = [
  '#8B5CF6', '#10B981', '#F59E0B', '#3B82F6', '#F43F5E',
  '#4cd7f6', '#EAB308', '#06B6D4', '#A78BFA', '#94A3B8',
]

// Типы зон: лейбл, иконка, цвет — перенесено из раздела «Зоны».
const SPACE_TYPE_MAP: Record<string, [string, string, string]> = {
  small_booth: ['Малая кабинка',   'meeting_room',   '#3B82F6'],
  large_booth: ['Большая кабинка', 'door_front',     '#06B6D4'],
  hall:        ['Зал',             'warehouse',      '#94A3B8'],
  table:       ['Стол',            'table_bar',      '#8B5CF6'],
  vr:          ['VR зона',         'vrpano',         '#4cd7f6'],
  ps5:         ['PS5',             'sports_esports', '#10B981'],
  zone:        ['Зона',            'grid_view',      '#F59E0B'],
}
const SPACE_TYPE_KEYS = ['small_booth', 'large_booth', 'hall', 'table', 'vr', 'ps5', 'zone']

// Единая шапка-строка вкладки: счётчик слева + кнопка «Добавить» справа.
function TabBar({ count, label, action }: {
  count: number
  label: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface-variant)', margin: 0 }}>
        {count} {label}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', borderRadius: 12, minHeight: 40,
            background: 'var(--primary-violet)', color: '#fff',
            fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          }}
        >
          <Icon name="add" size={18} />
          {action.label}
        </button>
      )}
    </div>
  )
}

// Единая карточка списка (glass-l2). Тап открывает Sheet редактирования.
function Card({ accent, icon, title, subtitle, right, dim, onClick }: {
  accent: string
  icon: string
  title: string
  subtitle?: string
  right?: React.ReactNode
  dim?: boolean
  onClick?: () => void
}) {
  return (
    <div
      className="glass-l2"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        borderRadius: 16, padding: 16,
        cursor: onClick ? 'pointer' : 'default',
        opacity: dim ? 0.5 : 1,
        transition: 'border-color 0.2s, transform 0.15s',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = `${accent}55`; e.currentTarget.style.transform = 'translateY(-2px)' } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 13, background: `${accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={22} color={accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        {subtitle && <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      {right && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div>}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {COLOR_PALETTE.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Цвет ${c}`}
          style={{
            width: 34, height: 34, borderRadius: 10, cursor: 'pointer',
            background: c,
            border: value === c ? '2px solid #fff' : '2px solid transparent',
            boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
          }}
        />
      ))}
    </div>
  )
}

const PRICE_CSS: React.CSSProperties = { fontSize: 15, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }

export default function PricingPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const user = useAuthStore(s => s.user)
  const isOwner = (user?.role ?? 'staff') === 'owner'

  const [tab, setTab] = useState<Tab>('tariffs')

  // Чтение ?tab= на маунте (без useSearchParams/Suspense).
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab')
      if (t === 'tariffs' || t === 'evenings' || t === 'rental' || t === 'events') setTab(t)
    } catch { /* noop */ }
  }, [])

  // ── ТАРИФЫ ────────────────────────────────────────────────────────────────
  const { data: tariffsData, isLoading: tariffsLoading } = useQuery({
    queryKey: ['pricing', 'tariffs'],
    queryFn: () => api.get<{ tariffs: Tariff[] } | Tariff[]>('/pricing/tariffs'),
  })
  const tariffs: Tariff[] = Array.isArray(tariffsData) ? tariffsData : (tariffsData?.tariffs ?? [])

  const [tariffForm, setTariffForm] = useState<{ id?: string; name: string; price: string; color: string }>(
    { name: '', price: '0', color: COLOR_PALETTE[0] },
  )
  const [showTariffForm, setShowTariffForm] = useState(false)
  const [confirmDelTariff, setConfirmDelTariff] = useState<string | null>(null)

  const saveTariff = useMutation({
    mutationFn: (b: { id?: string; name: string; price: number; color: string }) =>
      b.id
        ? api.patch(`/pricing/tariffs/${b.id}`, { name: b.name, price: b.price, color: b.color })
        : api.post('/pricing/tariffs', { name: b.name, price: b.price, color: b.color }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing', 'tariffs'] }); setShowTariffForm(false) },
    onError: () => show('Не удалось сохранить тариф', 'error'),
  })
  const delTariff = useMutation({
    mutationFn: (id: string) => api.delete(`/pricing/tariffs/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing', 'tariffs'] }); setConfirmDelTariff(null); setShowTariffForm(false) },
    onError: () => { setConfirmDelTariff(null); show('Не удалось удалить тариф', 'error') },
  })

  function openTariff(t?: Tariff) {
    setTariffForm(t
      ? { id: t.id, name: t.name, price: String(t.price ?? 0), color: t.color ?? COLOR_PALETTE[0] }
      : { name: '', price: '0', color: COLOR_PALETTE[0] })
    setShowTariffForm(true)
  }

  // ── ТИПЫ ВЕЧЕРОВ ──────────────────────────────────────────────────────────
  const { data: eveningsData, isLoading: eveningsLoading } = useQuery({
    queryKey: ['pricing', 'evening-types'],
    queryFn: () => api.get<{ eveningTypes: EveningType[] } | EveningType[]>('/pricing/evening-types'),
  })
  const evenings: EveningType[] = Array.isArray(eveningsData) ? eveningsData : (eveningsData?.eveningTypes ?? [])

  const [eveningForm, setEveningForm] = useState<{ key?: string; label: string; color: string; isSystem?: boolean }>(
    { label: '', color: COLOR_PALETTE[1] },
  )
  const [showEveningForm, setShowEveningForm] = useState(false)
  const [confirmDelEvening, setConfirmDelEvening] = useState<string | null>(null)

  const saveEvening = useMutation({
    mutationFn: (b: { key?: string; label: string; color: string }) =>
      b.key
        ? api.patch(`/pricing/evening-types/${b.key}`, { label: b.label, color: b.color })
        : api.post('/pricing/evening-types', { label: b.label, color: b.color }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing', 'evening-types'] }); setShowEveningForm(false) },
    onError: () => show('Не удалось сохранить тип вечера', 'error'),
  })
  const delEvening = useMutation({
    mutationFn: (key: string) => api.delete(`/pricing/evening-types/${key}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing', 'evening-types'] }); setConfirmDelEvening(null); setShowEveningForm(false) },
    onError: () => { setConfirmDelEvening(null); show('Не удалось удалить тип вечера', 'error') },
  })

  function openEvening(e?: EveningType) {
    setEveningForm(e
      ? { key: e.key, label: e.label, color: e.color ?? COLOR_PALETTE[1], isSystem: e.isSystem || e.key === 'none' }
      : { label: '', color: COLOR_PALETTE[1] })
    setShowEveningForm(true)
  }

  // ── АРЕНДА (зоны — полный CRUD) ───────────────────────────────────────────
  const { data: spacesData, isLoading: spacesLoading } = useQuery({
    queryKey: ['spaces', 'all'],
    queryFn: () => api.get<{ spaces: Space[] }>('/spaces/all'),
  })
  const spaces: Space[] = spacesData?.spaces ?? []

  const SPACE_BLANK = { name: '', type: 'table', hourlyRate: '0', capacity: '', isActive: true }
  const [spaceEditing, setSpaceEditing] = useState<Space | null>(null)
  const [spaceForm, setSpaceForm] = useState<{ name: string; type: string; hourlyRate: string; capacity: string; isActive: boolean }>(SPACE_BLANK)
  const [showSpaceForm, setShowSpaceForm] = useState(false)
  const [confirmDelSpace, setConfirmDelSpace] = useState<string | null>(null)

  const saveSpace = useMutation({
    mutationFn: (b: { id?: string; name: string; type: string; hourlyRate: number; capacity?: number; isActive: boolean }) =>
      b.id
        ? api.patch(`/spaces/${b.id}`, { name: b.name, type: b.type, hourlyRate: b.hourlyRate, capacity: b.capacity, isActive: b.isActive })
        : api.post('/spaces', { name: b.name, type: b.type, hourlyRate: b.hourlyRate, capacity: b.capacity }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spaces'] }); setShowSpaceForm(false); setSpaceEditing(null) },
    onError: () => show('Не удалось сохранить зону', 'error'),
  })
  const delSpace = useMutation({
    mutationFn: (id: string) => api.delete(`/spaces/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spaces'] }); setConfirmDelSpace(null); setShowSpaceForm(false); setSpaceEditing(null) },
    onError: () => { setConfirmDelSpace(null); show('Не удалось удалить зону', 'error') },
  })

  // Код привязки планшета.
  const [pairCode, setPairCode] = useState<{ code: string; spaceName: string; expiresIn: number } | null>(null)
  const [pairCountdown, setPairCountdown] = useState(0)
  const genPair = useMutation({
    mutationFn: (spaceId: string) => api.post<{ code: string; spaceName: string; expiresIn: number }>(`/spaces/${spaceId}/tablet-link-code`, {}),
    onSuccess: (data) => { setPairCode(data); setPairCountdown(data.expiresIn) },
    onError: () => show('Не удалось сгенерировать код', 'error'),
  })
  useEffect(() => {
    if (!pairCode || pairCountdown <= 0) return
    const t = setInterval(() => {
      setPairCountdown((s) => { if (s <= 1) { setPairCode(null); return 0 } return s - 1 })
    }, 1000)
    return () => clearInterval(t)
  }, [pairCode, pairCountdown])

  function openSpace(s?: Space) {
    setSpaceEditing(s ?? null)
    setSpaceForm(s
      ? { name: s.name, type: s.type, hourlyRate: String(s.hourlyRate ?? 0), capacity: String(s.capacity ?? ''), isActive: s.isActive ?? true }
      : SPACE_BLANK)
    setShowSpaceForm(true)
  }

  // ── МЕРОПРИЯТИЯ (почасовые тарифы) ────────────────────────────────────────
  const { data: eventRatesData, isLoading: eventRatesLoading } = useQuery({
    queryKey: ['pricing', 'event-rates'],
    queryFn: () => api.get<{ rates: EventRate[] }>('/pricing/event-rates'),
  })
  const eventRates: EventRate[] = eventRatesData?.rates ?? []

  const [eventRateForm, setEventRateForm] = useState<{ existing?: boolean; hours: string; price: string }>({ hours: '', price: '0' })
  const [showEventRateForm, setShowEventRateForm] = useState(false)
  const saveEventRate = useMutation({
    mutationFn: (b: { hours: number; price: number }) =>
      api.patch(`/pricing/event-rates/${b.hours}`, { price: b.price }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing', 'event-rates'] }); setShowEventRateForm(false) },
    onError: () => show('Не удалось сохранить тариф мероприятия', 'error'),
  })

  function openEventRate(r?: EventRate) {
    setEventRateForm(r
      ? { existing: true, hours: String(r.hours), price: String(parseFloat(String(r.price ?? 0)) || 0) }
      : { hours: '', price: '0' })
    setShowEventRateForm(true)
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'tariffs', label: 'Тарифы', icon: 'confirmation_number' },
    { key: 'evenings', label: 'Типы вечеров', icon: 'celebration' },
    { key: 'rental', label: 'Аренда', icon: 'meeting_room' },
    { key: 'events', label: 'Мероприятия', icon: 'schedule' },
  ]

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Тарифы и аренда" subtitle="Стандартные тарифы, типы вечеров, ставки аренды" />

      <div style={{ padding: '12px 16px 0', maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%' }}>
        {/* Сегментированный переключатель (как в Складе): иконка над подписью */}
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 4px', borderRadius: 11, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: active ? 'var(--primary-violet)' : 'transparent', color: active ? '#fff' : 'var(--on-surface-variant)' }}>
                <Icon name={t.icon} size={19} color={active ? '#fff' : 'var(--on-surface-variant)'} />
                <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{t.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%' }}>
        {/* ─── ТАРИФЫ ─── */}
        {tab === 'tariffs' && (() => {
          // Статусы клиента (key, иерархия Резидент→Студент→Новичок→Гость) +
          // дополнительные тарифы без статуса (напр. «Одна игра»). Сумма за вечер/игру.
          const list = tariffs.filter(t => t.isActive !== false)
          return (
          <>
            <TabBar count={list.length} label="тарифов" action={isOwner ? { label: 'Добавить', onClick: () => openTariff() } : undefined} />
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 10px', lineHeight: 1.5 }}>
              Статус клиента и тариф — одно и то же (Резидент → Студент → Новичок → Гость, у каждого своя сумма за вечер). Можно добавить и обычные тарифы без статуса — например «Одна игра».
            </p>
            {tariffsLoading ? <StateView state="loading" />
              : list.length === 0 ? <StateView state="empty" icon="confirmation_number" title="Нет тарифов" />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {list.map(t => {
                    const color = t.color ?? '#8B5CF6'
                    const price = parseFloat(String(t.price ?? 0)) || 0
                    return (
                      <Card
                        key={t.id}
                        accent={color}
                        icon={t.key ? 'workspace_premium' : 'confirmation_number'}
                        title={t.name}
                        subtitle={t.key ? 'Статус клиента · сумма за вечер' : 'Тариф'}
                        onClick={isOwner ? () => openTariff(t) : undefined}
                        right={<span style={{ ...PRICE_CSS, color }}>{price.toLocaleString('ru')} ₽</span>}
                      />
                    )
                  })}
                </div>
              )}
          </>
          )
        })()}

        {/* ─── ТИПЫ ВЕЧЕРОВ ─── */}
        {tab === 'evenings' && (
          <>
            <TabBar count={evenings.length} label="типов" action={isOwner ? { label: 'Добавить', onClick: () => openEvening() } : undefined} />
            {eveningsLoading ? <StateView state="loading" />
              : evenings.length === 0 ? <StateView state="empty" icon="celebration" title="Нет типов вечеров" description={isOwner ? 'Добавьте тип вечера' : 'Типы вечеров не настроены'} />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {evenings.map(e => {
                    const color = e.color ?? '#10B981'
                    const isSystem = e.isSystem || e.key === 'none'
                    return (
                      <Card
                        key={e.key}
                        accent={color}
                        icon="celebration"
                        title={e.label}
                        subtitle={isSystem ? 'Системный' : undefined}
                        onClick={isOwner ? () => openEvening(e) : undefined}
                      />
                    )
                  })}
                </div>
              )}
          </>
        )}

        {/* ─── АРЕНДА (зоны) ─── */}
        {tab === 'rental' && (
          <>
            <TabBar count={spaces.length} label="зон" action={isOwner ? { label: 'Добавить зону', onClick: () => openSpace() } : undefined} />
            {spacesLoading ? <StateView state="loading" />
              : spaces.length === 0 ? <StateView state="empty" icon="meeting_room" title="Нет зон" description={isOwner ? 'Добавьте первую зону' : 'Зоны не настроены'} />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {spaces.map(s => {
                    const [label, icon, color] = SPACE_TYPE_MAP[s.type] ?? ['Зона', 'grid_view', '#94A3B8']
                    const rate = parseFloat(String(s.hourlyRate ?? 0)) || 0
                    return (
                      <Card
                        key={s.id}
                        accent={color}
                        icon={icon}
                        title={s.name}
                        subtitle={s.capacity ? `${label} · ${s.capacity} чел.` : label}
                        dim={s.isActive === false}
                        onClick={isOwner ? () => openSpace(s) : undefined}
                        right={<span style={{ ...PRICE_CSS, color }}>{rate.toLocaleString('ru')} ₽/ч</span>}
                      />
                    )
                  })}
                </div>
              )}
          </>
        )}

        {/* ─── МЕРОПРИЯТИЯ ─── */}
        {tab === 'events' && (
          <>
            <TabBar count={eventRates.length} label="тарифов" action={isOwner ? { label: 'Добавить', onClick: () => openEventRate() } : undefined} />
            {eventRatesLoading ? <StateView state="loading" />
              : eventRates.length === 0 ? <StateView state="empty" icon="schedule" title="Нет тарифов" description={isOwner ? 'Добавьте почасовой тариф' : 'Почасовые тарифы не настроены'} />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, paddingLeft: 4, lineHeight: 1.4 }}>
                    Цена за весь период по числу часов — основа чека для мероприятий с почасовой оплатой.
                  </p>
                  {eventRates.map(r => {
                    const price = parseFloat(String(r.price ?? 0)) || 0
                    return (
                      <Card
                        key={r.hours}
                        accent="#A78BFA"
                        icon="schedule"
                        title={`${r.hours} ч`}
                        onClick={isOwner ? () => openEventRate(r) : undefined}
                        right={<span style={{ ...PRICE_CSS, color: '#A78BFA' }}>{formatMoney(price, { currency: false })} ₽</span>}
                      />
                    )
                  })}
                </div>
              )}
          </>
        )}
      </div>

      {/* ─── Sheet: тариф ─── */}
      <Sheet open={showTariffForm} onClose={() => setShowTariffForm(false)} title={tariffForm.id ? 'Редактировать статус' : 'Новый статус'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Название статуса *</label>
            <input value={tariffForm.name} onChange={e => setTariffForm(p => ({ ...p, name: e.target.value }))} style={INP} placeholder="Резидент, Студент, Новичок, Гость" />
          </div>
          <div>
            <label style={LBL}>Сумма за вечер (₽)</label>
            <input type="number" value={tariffForm.price} onChange={e => setTariffForm(p => ({ ...p, price: e.target.value }))} style={INP} />
          </div>
          <div>
            <label style={LBL}>Цвет</label>
            <ColorPicker value={tariffForm.color} onChange={c => setTariffForm(p => ({ ...p, color: c }))} />
          </div>
          <Button
            fullWidth size="lg"
            loading={saveTariff.isPending}
            disabled={!tariffForm.name.trim()}
            onClick={() => saveTariff.mutate({ id: tariffForm.id, name: tariffForm.name.trim(), price: Number(tariffForm.price) || 0, color: tariffForm.color })}
            style={{ marginTop: 4 }}
          >
            Сохранить
          </Button>
          {tariffForm.id && isOwner && !tariffs.find(t => t.id === tariffForm.id)?.isSystem && (
            <Button fullWidth variant="danger" icon="delete" onClick={() => setConfirmDelTariff(tariffForm.id!)}>Удалить статус</Button>
          )}
        </div>
      </Sheet>

      {/* ─── Sheet: тип вечера ─── */}
      <Sheet open={showEveningForm} onClose={() => setShowEveningForm(false)} title={eveningForm.key ? 'Редактировать тип вечера' : 'Новый тип вечера'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Название *</label>
            <input value={eveningForm.label} onChange={e => setEveningForm(p => ({ ...p, label: e.target.value }))} style={INP} placeholder="Спортивная мафия, Настолки…" />
          </div>
          <div>
            <label style={LBL}>Цвет</label>
            <ColorPicker value={eveningForm.color} onChange={c => setEveningForm(p => ({ ...p, color: c }))} />
          </div>
          <Button
            fullWidth size="lg"
            loading={saveEvening.isPending}
            disabled={!eveningForm.label.trim()}
            onClick={() => saveEvening.mutate({ key: eveningForm.key, label: eveningForm.label.trim(), color: eveningForm.color })}
            style={{ marginTop: 4 }}
          >
            Сохранить
          </Button>
          {eveningForm.key && isOwner && !eveningForm.isSystem && (
            <Button fullWidth variant="danger" icon="delete" onClick={() => setConfirmDelEvening(eveningForm.key!)}>Удалить тип вечера</Button>
          )}
        </div>
      </Sheet>

      {/* ─── Sheet: зона ─── */}
      <Sheet open={showSpaceForm} onClose={() => { setShowSpaceForm(false); setSpaceEditing(null) }} title={spaceEditing ? 'Редактировать зону' : 'Новая зона'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Название *</label>
            <input value={spaceForm.name} onChange={e => setSpaceForm(p => ({ ...p, name: e.target.value }))} style={INP} placeholder="Стол 1, VR комната…" />
          </div>
          <div>
            <label style={LBL}>Тип</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SPACE_TYPE_KEYS.map(k => {
                const [l, icon, color] = SPACE_TYPE_MAP[k]
                const active = spaceForm.type === k
                return (
                  <button key={k} type="button" onClick={() => setSpaceForm(p => ({ ...p, type: k }))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`, background: active ? `${color}22` : 'rgba(255,255,255,0.04)', color: active ? color : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                    <Icon name={icon} size={14} />{l}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label style={LBL}>Ставка в час (₽)</label>
            <input type="number" value={spaceForm.hourlyRate} onChange={e => setSpaceForm(p => ({ ...p, hourlyRate: e.target.value }))} style={INP} />
          </div>
          <div>
            <label style={LBL}>Вместимость (чел.)</label>
            <input type="number" value={spaceForm.capacity} onChange={e => setSpaceForm(p => ({ ...p, capacity: e.target.value }))} placeholder="Не указано" style={INP} />
          </div>
          {spaceEditing && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Активна</p>
              <Toggle value={spaceForm.isActive} onChange={v => setSpaceForm(p => ({ ...p, isActive: v }))} />
            </div>
          )}

          <Button
            fullWidth size="lg"
            loading={saveSpace.isPending}
            disabled={!spaceForm.name.trim()}
            onClick={() => saveSpace.mutate({
              id: spaceEditing?.id,
              name: spaceForm.name.trim(),
              type: spaceForm.type,
              hourlyRate: Number(spaceForm.hourlyRate) || 0,
              capacity: spaceForm.capacity ? Number(spaceForm.capacity) : undefined,
              isActive: spaceForm.isActive,
            })}
            style={{ marginTop: 4 }}
          >
            Сохранить
          </Button>

          {spaceEditing && isOwner && (
            <>
              <Button fullWidth variant="secondary" icon="tablet_mac" loading={genPair.isPending} onClick={() => genPair.mutate(spaceEditing.id)}>
                Код привязки планшета
              </Button>
              <Button fullWidth variant="danger" icon="delete" onClick={() => setConfirmDelSpace(spaceEditing.id)}>Удалить зону</Button>
            </>
          )}
        </div>
      </Sheet>

      {/* ─── Sheet: тариф мероприятия ─── */}
      <Sheet open={showEventRateForm} onClose={() => setShowEventRateForm(false)} title={eventRateForm.existing ? `${eventRateForm.hours} ч` : 'Новый тариф'} desktopSize="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Число часов *</label>
            <input
              type="number"
              disabled={eventRateForm.existing}
              value={eventRateForm.hours}
              onChange={e => setEventRateForm(p => ({ ...p, hours: e.target.value }))}
              style={{ ...INP, opacity: eventRateForm.existing ? 0.6 : 1 }}
              placeholder="Например, 3"
            />
          </div>
          <div>
            <label style={LBL}>Цена за период (₽)</label>
            <input type="number" value={eventRateForm.price} onChange={e => setEventRateForm(p => ({ ...p, price: e.target.value }))} style={INP} />
          </div>
          <Button
            fullWidth size="lg"
            loading={saveEventRate.isPending}
            disabled={!eventRateForm.hours || !(Number(eventRateForm.hours) > 0)}
            onClick={() => saveEventRate.mutate({ hours: Number(eventRateForm.hours), price: Number(eventRateForm.price) || 0 })}
          >
            Сохранить
          </Button>
        </div>
      </Sheet>

      {/* ─── Диалог кода привязки планшета ─── */}
      {pairCode && (
        <div
          onClick={() => setPairCode(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="glass-l2" style={{ borderRadius: 24, padding: 32, maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="tablet_mac" size={32} color="#a78bfa" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>Код привязки</h3>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>{pairCode.spaceName}</p>
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em', color: '#a78bfa', padding: '12px 24px', borderRadius: 16, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)' }}>
              {pairCode.code}
            </div>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, textAlign: 'center' }}>
              Откройте на планшете <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>titanpos.ru/tablet</code> и введите код.
              <br />Действителен ещё {Math.floor(pairCountdown / 60)}:{String(pairCountdown % 60).padStart(2, '0')}
            </p>
            <button onClick={() => setPairCode(null)} style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelTariff}
        onClose={() => setConfirmDelTariff(null)}
        onConfirm={() => confirmDelTariff && delTariff.mutate(confirmDelTariff)}
        title="Удалить тариф?"
        message="Тариф больше не будет доступен на кассе."
        confirmLabel="Удалить"
        danger
        loading={delTariff.isPending}
      />
      <ConfirmDialog
        open={!!confirmDelEvening}
        onClose={() => setConfirmDelEvening(null)}
        onConfirm={() => confirmDelEvening && delEvening.mutate(confirmDelEvening)}
        title="Удалить тип вечера?"
        confirmLabel="Удалить"
        danger
        loading={delEvening.isPending}
      />
      <ConfirmDialog
        open={!!confirmDelSpace}
        onClose={() => setConfirmDelSpace(null)}
        onConfirm={() => confirmDelSpace && delSpace.mutate(confirmDelSpace)}
        title="Удалить зону?"
        message="Зона будет скрыта, но история чеков по ней сохранится."
        confirmLabel="Удалить"
        danger
        loading={delSpace.isPending}
      />
    </div>
  )
}
