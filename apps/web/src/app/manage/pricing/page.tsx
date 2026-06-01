'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { PageHeader, Sheet, Button, ConfirmDialog, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

// ─── Типы доменных сущностей ─────────────────────────────────────────────────
interface Tariff {
  id: string
  name: string
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

// Группировка зон по типу для аренды (читабельные подписи).
const SPACE_TYPE_LABELS: Record<string, string> = {
  hall: 'Общий зал',
  large_booth: 'Большая кабинка',
  small_booth: 'Маленькая кабинка',
  table: 'Столы',
  vr: 'VR зоны',
  ps5: 'PS5',
  zone: 'Зоны',
}
const SPACE_TYPE_ORDER = ['hall', 'large_booth', 'small_booth', 'table', 'vr', 'ps5', 'zone']

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

export default function PricingPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const user = useAuthStore(s => s.user)
  const isOwner = (user?.role ?? 'staff') === 'owner'

  const [tab, setTab] = useState<Tab>('tariffs')

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing', 'tariffs'] }); setConfirmDelTariff(null) },
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

  const [eveningForm, setEveningForm] = useState<{ key?: string; label: string; color: string }>(
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing', 'evening-types'] }); setConfirmDelEvening(null) },
    onError: () => { setConfirmDelEvening(null); show('Не удалось удалить тип вечера', 'error') },
  })

  function openEvening(e?: EveningType) {
    setEveningForm(e
      ? { key: e.key, label: e.label, color: e.color ?? COLOR_PALETTE[1] }
      : { label: '', color: COLOR_PALETTE[1] })
    setShowEveningForm(true)
  }

  // ── АРЕНДА (зоны) ─────────────────────────────────────────────────────────
  const { data: spacesData, isLoading: spacesLoading } = useQuery({
    queryKey: ['spaces', 'all'],
    queryFn: () => api.get<{ spaces: Space[] }>('/spaces/all'),
  })
  const spaces: Space[] = spacesData?.spaces ?? []

  const [rateEdit, setRateEdit] = useState<{ id: string; name: string; rate: string } | null>(null)
  const saveRate = useMutation({
    mutationFn: (b: { id: string; hourlyRate: number }) =>
      api.patch(`/spaces/${b.id}`, { hourlyRate: b.hourlyRate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spaces'] }); setRateEdit(null) },
    onError: () => show('Не удалось сохранить ставку', 'error'),
  })

  // Группировка зон по типу.
  const spacesByType = (() => {
    const groups: Record<string, Space[]> = {}
    for (const s of spaces) {
      const t = s.type || 'zone'
      ;(groups[t] ??= []).push(s)
    }
    const keys = Object.keys(groups).sort((a, b) => {
      const ia = SPACE_TYPE_ORDER.indexOf(a); const ib = SPACE_TYPE_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    return keys.map(k => ({ type: k, label: SPACE_TYPE_LABELS[k] ?? k, items: groups[k] }))
  })()

  // ── МЕРОПРИЯТИЯ (почасовые тарифы) ────────────────────────────────────────
  const { data: eventRatesData, isLoading: eventRatesLoading } = useQuery({
    queryKey: ['pricing', 'event-rates'],
    queryFn: () => api.get<{ rates: EventRate[] }>('/pricing/event-rates'),
  })
  const eventRates: EventRate[] = eventRatesData?.rates ?? []

  const [eventRateEdit, setEventRateEdit] = useState<{ hours: number; price: string } | null>(null)
  const saveEventRate = useMutation({
    mutationFn: (b: { hours: number; price: number }) =>
      api.patch(`/pricing/event-rates/${b.hours}`, { price: b.price }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing', 'event-rates'] }); setEventRateEdit(null) },
    onError: () => show('Не удалось сохранить тариф мероприятия', 'error'),
  })

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'tariffs', label: 'Тарифы', icon: 'confirmation_number' },
    { key: 'evenings', label: 'Типы вечеров', icon: 'celebration' },
    { key: 'rental', label: 'Аренда', icon: 'meeting_room' },
    { key: 'events', label: 'Мероприятия', icon: 'schedule' },
  ]

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Тарифы и аренда"
        subtitle="Стандартные тарифы, типы вечеров, ставки аренды"
        action={
          isOwner
            ? tab === 'tariffs'
              ? { label: 'Тариф', icon: 'add', onClick: () => openTariff() }
              : tab === 'evenings'
                ? { label: 'Тип', icon: 'add', onClick: () => openEvening() }
                : undefined
            : undefined
        }
      />

      <div style={{ padding: '12px 16px 0', maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                color: tab === t.key ? '#8B5CF6' : 'var(--on-surface-variant)',
                borderBottom: tab === t.key ? '2px solid #8B5CF6' : '2px solid transparent',
                marginBottom: -1, whiteSpace: 'nowrap',
              }}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {/* ─── ТАРИФЫ ─── */}
        {tab === 'tariffs' && (
          tariffsLoading ? <StateView state="loading" />
          : tariffs.length === 0 ? <StateView state="empty" icon="confirmation_number" title="Нет тарифов" description={isOwner ? 'Добавьте первый тариф' : 'Тарифы не настроены'} />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {tariffs.map(t => {
                const color = t.color ?? '#8B5CF6'
                const price = parseFloat(String(t.price ?? 0)) || 0
                return (
                  <div
                    key={t.id}
                    className="glass-l2"
                    onClick={() => isOwner && openTariff(t)}
                    style={{ borderRadius: 18, padding: 18, position: 'relative', cursor: isOwner ? 'pointer' : 'default', opacity: t.isActive ? 1 : 0.5, transition: 'border-color 0.2s, transform 0.15s' }}
                    onMouseEnter={e => { if (isOwner) { e.currentTarget.style.borderColor = `${color}55`; e.currentTarget.style.transform = 'translateY(-2px)' } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{ width: 46, height: 46, borderRadius: 13, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 16px ${color}22` }}>
                        <Icon name="confirmation_number" size={22} color={color} />
                      </div>
                      {!t.isActive && (
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(204,195,216,0.5)', textTransform: 'uppercase' }}>Откл.</span>
                      )}
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>{t.name}</p>
                    <span style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', color, fontFamily: "'JetBrains Mono',monospace" }}>
                      {price.toLocaleString('ru')} ₽
                    </span>
                    {isOwner && (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDelTariff(t.id) }}
                        aria-label="Удалить тариф"
                        style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(251,113,133,0.25)', background: 'rgba(251,113,133,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}
                      >
                        <Icon name="delete" size={15} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ─── ТИПЫ ВЕЧЕРОВ ─── */}
        {tab === 'evenings' && (
          eveningsLoading ? <StateView state="loading" />
          : evenings.length === 0 ? <StateView state="empty" icon="celebration" title="Нет типов вечеров" description={isOwner ? 'Добавьте тип вечера' : 'Типы вечеров не настроены'} />
          : (
            <div className="glass-l2" style={{ borderRadius: 18, overflow: 'hidden' }}>
              {evenings.map((e, i) => {
                const color = e.color ?? '#10B981'
                const isNone = e.key === 'none'
                return (
                  <div
                    key={e.key}
                    onClick={() => isOwner && openEvening(e)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: isOwner ? 'pointer' : 'default', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                  >
                    <div style={{ width: 14, height: 14, borderRadius: 5, background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{e.label}</p>
                      {(e.isSystem || isNone) && (
                        <p style={{ fontSize: 10, color: 'var(--on-surface-variant)', margin: '2px 0 0', fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.06em' }}>Системный</p>
                      )}
                    </div>
                    {isOwner && !isNone && (
                      <button
                        onClick={ev => { ev.stopPropagation(); setConfirmDelEvening(e.key) }}
                        aria-label="Удалить тип вечера"
                        style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(251,113,133,0.25)', background: 'rgba(251,113,133,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', flexShrink: 0 }}
                      >
                        <Icon name="delete" size={15} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ─── АРЕНДА ─── */}
        {tab === 'rental' && (
          spacesLoading ? <StateView state="loading" />
          : spaces.length === 0 ? <StateView state="empty" icon="meeting_room" title="Нет зон" description="Добавьте зоны в разделе «Зоны»" />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {spacesByType.map(group => (
                <div key={group.type}>
                  <p style={{ ...LBL, marginBottom: 10, paddingLeft: 4 }}>{group.label}</p>
                  <div className="glass-l2" style={{ borderRadius: 18, overflow: 'hidden' }}>
                    {group.items.map((s, i) => {
                      const rate = parseFloat(String(s.hourlyRate ?? 0)) || 0
                      return (
                        <div
                          key={s.id}
                          onClick={() => isOwner && setRateEdit({ id: s.id, name: s.name, rate: String(rate) })}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: isOwner ? 'pointer' : 'default', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', opacity: s.isActive === false ? 0.5 : 1 }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{s.name}</p>
                          </div>
                          <span style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', color: '#A78BFA', fontFamily: "'JetBrains Mono',monospace" }}>
                            {rate.toLocaleString('ru')} ₽/ч
                          </span>
                          {isOwner && <Icon name="edit" size={16} color="var(--on-surface-variant)" />}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ─── МЕРОПРИЯТИЯ ─── */}
        {tab === 'events' && (
          eventRatesLoading ? <StateView state="loading" />
          : eventRates.length === 0 ? <StateView state="empty" icon="schedule" title="Нет тарифов" description="Почасовые тарифы мероприятий не настроены" />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, paddingLeft: 4, lineHeight: 1.4 }}>
                Цена за весь период по числу часов — основа чека для мероприятий с почасовой оплатой.
              </p>
              <div className="glass-l2" style={{ borderRadius: 18, overflow: 'hidden' }}>
                {eventRates.map((r, i) => {
                  const price = parseFloat(String(r.price ?? 0)) || 0
                  return (
                    <div
                      key={r.hours}
                      onClick={() => isOwner && setEventRateEdit({ hours: r.hours, price: String(price) })}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: isOwner ? 'pointer' : 'default', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{r.hours} ч</p>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', color: '#A78BFA', fontFamily: "'JetBrains Mono',monospace" }}>
                        {formatMoney(price, { currency: false })} ₽
                      </span>
                      {isOwner && <Icon name="edit" size={16} color="var(--on-surface-variant)" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}
      </div>

      {/* ─── Sheet: тариф ─── */}
      <Sheet open={showTariffForm} onClose={() => setShowTariffForm(false)} title={tariffForm.id ? 'Редактировать тариф' : 'Новый тариф'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Название *</label>
            <input value={tariffForm.name} onChange={e => setTariffForm(p => ({ ...p, name: e.target.value }))} style={INP} placeholder="Гость, Резидент, Студент…" />
          </div>
          <div>
            <label style={LBL}>Цена (₽)</label>
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
        </div>
      </Sheet>

      {/* ─── Sheet: ставка аренды ─── */}
      <Sheet open={!!rateEdit} onClose={() => setRateEdit(null)} title={rateEdit?.name ?? 'Ставка'} desktopSize="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Ставка в час (₽)</label>
            <input
              type="number"
              autoFocus
              value={rateEdit?.rate ?? ''}
              onChange={e => setRateEdit(p => p ? { ...p, rate: e.target.value } : p)}
              style={INP}
            />
          </div>
          <Button
            fullWidth size="lg"
            loading={saveRate.isPending}
            onClick={() => rateEdit && saveRate.mutate({ id: rateEdit.id, hourlyRate: Number(rateEdit.rate) || 0 })}
          >
            Сохранить
          </Button>
        </div>
      </Sheet>

      {/* ─── Sheet: тариф мероприятия ─── */}
      <Sheet open={!!eventRateEdit} onClose={() => setEventRateEdit(null)} title={eventRateEdit ? `${eventRateEdit.hours} ч` : 'Тариф'} desktopSize="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Цена за период (₽)</label>
            <input
              type="number"
              autoFocus
              value={eventRateEdit?.price ?? ''}
              onChange={e => setEventRateEdit(p => p ? { ...p, price: e.target.value } : p)}
              style={INP}
            />
          </div>
          <Button
            fullWidth size="lg"
            loading={saveEventRate.isPending}
            onClick={() => eventRateEdit && saveEventRate.mutate({ hours: eventRateEdit.hours, price: Number(eventRateEdit.price) || 0 })}
          >
            Сохранить
          </Button>
        </div>
      </Sheet>

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
    </div>
  )
}
