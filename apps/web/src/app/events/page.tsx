'use client'
import React, { useState } from 'react'
import { Icon } from '@/components/Icon'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Sheet, INP, SEL, LBL } from '@/components/manage/DesignSystem'
import { TimeInput24 } from '@/components/TimeInput24'
import { useToast } from '@/components/Toast'

const STATUS: Record<string, [string, string, string]> = {
  planned:   ['Запланировано', '#3B82F6', 'schedule'],
  active:    ['Активно',       '#10B981', 'play_circle'],
  completed: ['Завершено',     '#94A3B8', 'check_circle'],
  cancelled: ['Отменено',      '#F43F5E', 'cancel'],
}

const TYPES: Record<string, [string, string, string]> = {
  titan: ['Titan клуб', 'home',            '#8B5CF6'],
  exit:  ['Выезд',      'directions_car',  '#F59E0B'],
}

const PAY_TYPES: Record<string, string> = {
  fixed:    'Фиксированная',
  per_head: 'С головы',
  free:     'Бесплатно',
}

const BILLING_MODES: Record<string, string> = {
  amount: 'Сумма',
  hourly: 'Почасовая аренда зоны',
}

const BLANK = {
  type: 'titan',
  title: '',
  location: '',
  spaceId: '',
  date: new Date().toISOString().split('T')[0],
  startTime: '18:00',
  endTime: '',
  paymentType: 'fixed' as 'fixed' | 'per_head' | 'free',
  billingMode: 'amount' as 'amount' | 'hourly',
  fixedAmount: '',
  perHeadAmount: '',
  manualAmount: '',
  maxGuests: '',
  responsibleStaffId: '',
  comment: '',
}

const MONTHS_SHORT = ['', 'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

// Секция формы с заголовком — группирует поля для читаемости модалки.
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: 0 }}>{title}</p>
      {children}
    </div>
  )
}

export default function EventsPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState<any>(BLANK)
  const [analyticsId, setAnalyticsId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const { data } = useQuery({ queryKey: ['events'], queryFn: () => api.get<any>('/events') })
  const allEvents: any[] = data?.events ?? []

  // sortable key from date + startTime, e.g. "2026-05-30T18:00"
  const sortKey = (e: any) => `${e.date ?? ''}T${e.startTime ?? '00:00'}`
  const isPast = (e: any) => e.status === 'completed' || e.status === 'cancelled'

  // Upcoming: planned/active, ascending (nearest first). Past: completed/cancelled, descending.
  const upcoming = allEvents
    .filter(e => !isPast(e))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const past = allEvents
    .filter(isPast)
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
  const events = tab === 'upcoming' ? upcoming : past
  const upcomingCount = upcoming.length

  // Staff list (owner + staff roles) — GET /staff → { staff: [{ id, nickname, role }] }
  const { data: staffData } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<{ staff: any[] }>('/staff'),
  })
  const staffList: any[] = staffData?.staff ?? []
  const staffById = (id: string | null | undefined) => staffList.find(s => s.id === id)

  const { data: spacesData } = useQuery({
    queryKey: ['pos', 'spaces'],
    queryFn: () => api.get<{ spaces: any[] }>('/pos/spaces'),
    enabled: showForm,
  })
  const spacesList: any[] = spacesData?.spaces ?? []

  const { data: analytics } = useQuery({
    queryKey: ['events', 'analytics', analyticsId],
    queryFn: () => api.get<any>(`/events/${analyticsId}/analytics`),
    enabled: !!analyticsId,
  })

  const create = useMutation({
    mutationFn: (b: any) => api.post('/events', b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      setShowForm(false)
      setForm(BLANK)
      setEditId(null)
      setFormError(null)
    },
    onError: (err: any) => {
      setFormError(err?.message ?? 'Ошибка сохранения')
    },
  })
  const saveEdit = useMutation({
    mutationFn: ({ id, ...b }: any) => api.patch(`/events/${id}`, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
      setShowForm(false)
      setForm(BLANK)
      setEditId(null)
      setFormError(null)
    },
    onError: (err: any) => {
      setFormError(err?.message ?? 'Ошибка сохранения')
    },
  })
  const update = useMutation({
    mutationFn: ({ id, ...b }: any) => api.patch(`/events/${id}`, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) },
    onError: (err: any) => show(err?.message ?? 'Не удалось изменить статус', 'error'),
  })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/events/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) } })

  function openCreate() {
    setForm(BLANK)
    setEditId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(ev: any) {
    setForm({
      type: ev.type ?? 'titan',
      title: ev.title ?? '',
      location: ev.location ?? '',
      spaceId: ev.spaceId ?? '',
      date: ev.date ?? new Date().toISOString().split('T')[0],
      startTime: ev.startTime ?? '18:00',
      endTime: ev.endTime ?? '',
      paymentType: ev.paymentType ?? 'fixed',
      billingMode: ev.billingMode ?? 'amount',
      fixedAmount: ev.fixedAmount != null ? String(ev.fixedAmount) : '',
      perHeadAmount: ev.perHeadAmount != null ? String(ev.perHeadAmount) : '',
      manualAmount: ev.manualAmount != null ? String(ev.manualAmount) : '',
      maxGuests: ev.maxGuests != null ? String(ev.maxGuests) : '',
      responsibleStaffId: ev.responsibleStaffId ?? '',
      comment: ev.comment ?? '',
    })
    setEditId(ev.id)
    setFormError(null)
    setSelected(null)
    setShowForm(true)
  }

  function startEvent(ev: any) {
    update.mutate({ id: ev.id, status: 'active' })
  }

  function submitForm() {
    setFormError(null)
    // Exit type always uses 'amount' billing; hourly only meaningful for titan
    const billingMode = form.type === 'exit' ? 'amount' : form.billingMode
    const hourly = billingMode === 'hourly'

    if (form.type === 'exit' && !form.responsibleStaffId) {
      setFormError('Для выезда укажите ответственного')
      return
    }

    const payload: any = {
      type: form.type,
      title: form.title || null,
      location: form.type === 'exit' ? (form.location || null) : null,
      spaceId: form.type === 'titan' ? (form.spaceId || null) : null,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime || null,
      paymentType: form.paymentType,
      billingMode,
      responsibleStaffId: form.responsibleStaffId || null,
      comment: form.comment || null,
      maxGuests: form.maxGuests ? parseInt(form.maxGuests) : null,
    }
    // Amounts: when hourly, charged per zone rate — clear manual/fixed overrides
    payload.fixedAmount = !hourly && form.paymentType === 'fixed' && form.fixedAmount ? parseFloat(form.fixedAmount) : null
    payload.perHeadAmount = form.paymentType === 'per_head' && form.perHeadAmount ? parseFloat(form.perHeadAmount) : null
    payload.manualAmount = !hourly && form.manualAmount ? parseFloat(form.manualAmount) : null

    if (editId) saveEdit.mutate({ id: editId, ...payload })
    else create.mutate(payload)
  }

  const saving = create.isPending || saveEdit.isPending

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflowX: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 680, margin: '0 auto', width: '100%' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Мероприятия</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
              {events.length} событий{upcomingCount > 0 ? ` · ${upcomingCount} предстоящих` : ''}
            </p>
          </div>
          <button
            onClick={openCreate}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
            }}
          >
            <Icon name="add" size={18} />
            Добавить
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', maxWidth: 680, margin: '12px auto 0', width: '100%' }}>
          {([['upcoming', 'Предстоящие', upcoming.length], ['past', 'Прошедшие', past.length]] as [typeof tab, string, number][]).map(([k, l, n]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
              borderBottom: tab === k ? '2px solid #8B5CF6' : '2px solid transparent',
              color: tab === k ? '#8B5CF6' : 'var(--on-surface-variant)',
              fontSize: 13, fontWeight: tab === k ? 700 : 500,
              transition: 'all 0.2s', marginBottom: -1, whiteSpace: 'nowrap',
            }}>
              {l}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 9999, background: tab === k ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.06)', color: tab === k ? '#a78bfa' : 'var(--on-surface-variant)' }}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px var(--bottom-nav-clear)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Icon name="event" size={56} color="rgba(204,195,216,0.2)" style={{ display: 'block', marginBottom: 12 }} />
            <p style={{ fontSize: 15, color: 'rgba(204,195,216,0.4)', margin: 0 }}>
              {tab === 'upcoming' ? 'Предстоящих мероприятий нет' : 'Прошедших мероприятий нет'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map((ev: any) => {
              const [statusLabel, statusColor, statusIcon] = STATUS[ev.status] ?? ['—', '#94A3B8', 'help']
              const [typeLabel, typeIcon, typeColor] = TYPES[ev.type] ?? ['—', 'event', '#94A3B8']
              const day = ev.date.split('-')[2]
              const month = MONTHS_SHORT[Number(ev.date.split('-')[1])] ?? ''
              const guestsLabel = ev.maxGuests
                ? `${ev.attendeesCount ?? 0} / ${ev.maxGuests}`
                : ev.attendeesCount > 0 ? `${ev.attendeesCount} гостей` : null
              const responsible = staffById(ev.responsibleStaffId)
              const baseAmount = ev.billingMode === 'hourly'
                ? 'почасовая'
                : ev.manualAmount != null
                ? `${parseFloat(ev.manualAmount).toLocaleString('ru')} ₽`
                : ev.paymentType === 'fixed' && ev.fixedAmount != null
                ? `${parseFloat(ev.fixedAmount).toLocaleString('ru')} ₽`
                : ev.paymentType === 'per_head' && ev.perHeadAmount != null
                ? `${parseFloat(ev.perHeadAmount).toLocaleString('ru')} ₽/чел`
                : null
              return (
                <div key={ev.id} className="glass-l2" onClick={() => setSelected(ev)}
                  style={{ borderRadius: 16, padding: '16px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'border-color 0.2s, transform 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${statusColor}44`; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                  {/* Calendar date block */}
                  <div style={{ width: 54, height: 54, borderRadius: 14, background: `${statusColor}18`, border: `1px solid ${statusColor}33`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', color: statusColor, lineHeight: 1 }}>{day}</span>
                    <span style={{ fontSize: 10, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: "'JetBrains Mono',monospace" }}>{month}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name={typeIcon} size={14} color={typeColor} />
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{ev.title || typeLabel}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 7px', borderRadius: 6, background: `${statusColor}20`, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name={statusIcon} size={10} />{statusLabel}
                      </span>
                      {guestsLabel && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Icon name="groups" size={11} />{guestsLabel}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 3px' }}>
                      {ev.startTime}{ev.endTime ? ` — ${ev.endTime}` : ''} · {PAY_TYPES[ev.paymentType] ?? ev.paymentType}
                      {baseAmount ? ` · ${baseAmount}` : ''}
                    </p>
                    {(ev.type === 'exit' && ev.location) && (
                      <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.6)', margin: '0 0 3px', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Icon name="location_on" size={12} color="#F59E0B" />{ev.location}
                      </p>
                    )}
                    {responsible && (
                      <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.6)', margin: '0 0 3px', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="person" size={12} color="#a78bfa" />{responsible.nickname}
                      </p>
                    )}
                    {ev.comment && <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.5)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.comment}</p>}
                  </div>
                  {ev.status === 'planned' ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); startEvent(ev) }}
                      disabled={update.isPending}
                      style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #10B981, #4cd7f6)', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0, boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}>
                      <Icon name="play_arrow" size={15} />Начать
                    </button>
                  ) : (
                    <Icon name="chevron_right" size={18} color="rgba(204,195,216,0.3)" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create / Edit sheet */}
      <Sheet open={showForm} onClose={() => { setShowForm(false); setEditId(null) }} title={editId ? 'Редактировать мероприятие' : 'Новое мероприятие'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Тип мероприятия — крупные карточки ── */}
          <div style={{ display: 'flex', gap: 10 }}>
            {Object.entries(TYPES).map(([k, [l, icon, c]]) => {
              const active = form.type === k
              return (
                <button key={k} onClick={() => setForm((p: any) => ({ ...p, type: k, billingMode: k === 'exit' ? 'amount' : p.billingMode }))}
                  style={{ flex: 1, padding: '16px 12px', borderRadius: 16, border: `1.5px solid ${active ? c : 'rgba(255,255,255,0.1)'}`, background: active ? `${c}1f` : 'rgba(255,255,255,0.03)', color: active ? c : 'var(--on-surface-variant)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all 0.15s', boxShadow: active ? `0 0 18px ${c}25` : 'none' }}>
                  <Icon name={icon} size={26} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{l}</span>
                  <span style={{ fontSize: 10, opacity: 0.7, textAlign: 'center' }}>{k === 'titan' ? 'в клубе, с зоной' : 'на выезде'}</span>
                </button>
              )
            })}
          </div>

          {/* ── Основное ── */}
          <FormSection title="Основное">
            <div><label style={LBL}>Название</label><input value={form.title} onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))} placeholder="Например: Турнир по покеру" style={INP} /></div>
            {form.type === 'titan' && spacesList.length > 0 && (
              <div>
                <label style={LBL}>Пространство</label>
                <select value={form.spaceId} onChange={e => setForm((p: any) => ({ ...p, spaceId: e.target.value }))} style={SEL}>
                  <option value="">Без привязки</option>
                  {spacesList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {form.type === 'exit' && (
              <div><label style={LBL}>Локация</label><input value={form.location ?? ''} onChange={e => setForm((p: any) => ({ ...p, location: e.target.value }))} placeholder="Адрес или место выезда" style={INP} /></div>
            )}
            <div>
              <label style={LBL}>Ответственный{form.type === 'exit' ? ' *' : ''}</label>
              <select value={form.responsibleStaffId} onChange={e => setForm((p: any) => ({ ...p, responsibleStaffId: e.target.value }))} style={SEL}>
                <option value="">{form.type === 'exit' ? 'Выберите сотрудника' : 'Не назначен'}</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.nickname}</option>)}
              </select>
            </div>
          </FormSection>

          {/* ── Дата и время ── */}
          <FormSection title="Дата и время">
            <div><label style={LBL}>Дата</label><input type="date" value={form.date} onChange={e => setForm((p: any) => ({ ...p, date: e.target.value }))} style={INP} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={LBL}>Начало</label><TimeInput24 value={form.startTime} onChange={v => setForm((p: any) => ({ ...p, startTime: v }))} /></div>
              <div><label style={LBL}>Конец</label><TimeInput24 value={form.endTime} onChange={v => setForm((p: any) => ({ ...p, endTime: v }))} /></div>
            </div>
          </FormSection>

          {/* ── Оплата ── */}
          <FormSection title="Оплата">
            {/* Тариф зоны — только titan */}
            {form.type === 'titan' && (
              <div>
                <label style={LBL}>Как берём основу</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(BILLING_MODES).map(([k, l]) => {
                    const active = form.billingMode === k
                    return (
                      <button key={k} onClick={() => setForm((p: any) => ({ ...p, billingMode: k }))}
                        style={{ flex: 1, padding: '12px 8px', borderRadius: 12, border: `1px solid ${active ? '#8B5CF6' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: active ? '#a78bfa' : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Icon name={k === 'hourly' ? 'schedule' : 'sell'} size={15} />{l}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {form.type === 'titan' && form.billingMode === 'hourly' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Icon name="schedule" size={18} color="#a78bfa" />
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0 }}>Оплата по почасовой ставке зоны — сумма посчитается на кассе по времени.</p>
              </div>
            ) : (
              <>
                <div>
                  <label style={LBL}>Тип оплаты</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Object.entries(PAY_TYPES).map(([k, v]) => {
                      const active = form.paymentType === k
                      return (
                        <button key={k} onClick={() => setForm((p: any) => ({ ...p, paymentType: k }))}
                          style={{ flex: 1, padding: '11px 4px', borderRadius: 10, border: `1px solid ${active ? '#8B5CF6' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: active ? '#a78bfa' : 'var(--on-surface-variant)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          {v}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {form.paymentType === 'fixed' && (
                  <div><label style={LBL}>Сумма (₽)</label><input type="number" inputMode="numeric" value={form.fixedAmount} onChange={e => setForm((p: any) => ({ ...p, fixedAmount: e.target.value }))} placeholder="0" style={INP} /></div>
                )}
                {form.paymentType === 'per_head' && (
                  <div><label style={LBL}>Сумма с гостя (₽)</label><input type="number" inputMode="numeric" value={form.perHeadAmount} onChange={e => setForm((p: any) => ({ ...p, perHeadAmount: e.target.value }))} placeholder="0" style={INP} /></div>
                )}
                {(form.paymentType === 'per_head' || form.paymentType === 'free') && (
                  <div>
                    <label style={LBL}>Итоговая сумма вручную (₽)</label>
                    <input type="number" inputMode="numeric" value={form.manualAmount} onChange={e => setForm((p: any) => ({ ...p, manualAmount: e.target.value }))} placeholder="Необязательно" style={INP} />
                    <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '6px 0 0' }}>Если указать — ляжет в чек как база события; иначе основа = 0, платим только за допы.</p>
                  </div>
                )}
              </>
            )}
          </FormSection>

          {/* ── Дополнительно ── */}
          <FormSection title="Дополнительно">
            <div><label style={LBL}>Максимум гостей</label><input type="number" inputMode="numeric" value={form.maxGuests} onChange={e => setForm((p: any) => ({ ...p, maxGuests: e.target.value }))} placeholder="Без ограничения" style={INP} /></div>
            <div><label style={LBL}>Комментарий</label><input value={form.comment} onChange={e => setForm((p: any) => ({ ...p, comment: e.target.value }))} placeholder="Необязательно" style={INP} /></div>
          </FormSection>

          {formError && (
            <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#F87171', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="error" size={15} />{formError}
            </div>
          )}
          <button onClick={submitForm} disabled={saving}
            style={{ width: '100%', padding: '15px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 800, letterSpacing: '0.02em', cursor: 'pointer', opacity: saving ? 0.6 : 1, boxShadow: '0 4px 18px rgba(139,92,246,0.3)' }}>
            {saving ? 'Сохраняем…' : editId ? 'Сохранить изменения' : 'Создать мероприятие'}
          </button>
        </div>
      </Sheet>

      {/* Detail sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected ? (selected.title || TYPES[selected.type]?.[0] || selected.type) : ''}>
        {selected && (() => {
          const [, statusColor, statusIcon] = STATUS[selected.status] ?? ['—', '#94A3B8', 'help']
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: `${statusColor}15`, border: `1px solid ${statusColor}33` }}>
                <Icon name={statusIcon} size={18} color={statusColor} />
                <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{STATUS[selected.status]?.[0]}</span>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginLeft: 'auto' }}>{selected.date}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {[
                  ['Время', `${selected.startTime}${selected.endTime ? ` — ${selected.endTime}` : ''}`],
                  selected.type === 'exit' ? ['Локация', selected.location || '—'] : null,
                  ['Ответственный', staffById(selected.responsibleStaffId)?.nickname || '—'],
                  ['Тип оплаты', PAY_TYPES[selected.paymentType] ?? selected.paymentType],
                  ['Тариф', selected.billingMode === 'hourly' ? 'Почасовая аренда зоны' : '—'],
                  ['Сумма', selected.billingMode === 'hourly'
                    ? 'почасовая'
                    : selected.manualAmount != null
                    ? `${parseFloat(selected.manualAmount).toLocaleString('ru')} ₽`
                    : selected.paymentType === 'fixed' && selected.fixedAmount
                    ? `${parseFloat(selected.fixedAmount).toLocaleString('ru')} ₽`
                    : selected.paymentType === 'per_head' && selected.perHeadAmount
                    ? `${parseFloat(selected.perHeadAmount).toLocaleString('ru')} ₽/чел`
                    : '—'],
                  ['Гостей', selected.maxGuests
                    ? `${selected.attendeesCount ?? 0} / ${selected.maxGuests}`
                    : selected.attendeesCount ? String(selected.attendeesCount) : '—'],
                  ['Комментарий', selected.comment || '—'],
                ].filter(Boolean).map((row) => { const [k, v] = row as [string, string]; return v && v !== '—' ? (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{k}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)' }}>{v}</span>
                  </div>
                ) : null })}
              </div>
              {selected.status === 'planned' && (
                <button onClick={() => startEvent(selected)} disabled={update.isPending}
                  style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #10B981, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 18px rgba(16,185,129,0.3)' }}>
                  <Icon name="play_arrow" size={18} />Начать мероприятие
                </button>
              )}
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => openEdit(selected)}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Icon name="edit" size={16} />Редактировать
                </button>
              </div>
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => setAnalyticsId(selected.id)}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Icon name="analytics" size={16} />Аналитика
                </button>
              </div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Изменить статус</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {Object.entries(STATUS).filter(([k]) => k !== selected.status).map(([k, [l, c]]) => (
                    <button key={k} onClick={() => update.mutate({ id: selected.id, status: k })}
                      style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${c}44`, background: `${c}11`, color: c, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => del.mutate(selected.id)}
                style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#F87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="delete" size={16} />Удалить мероприятие
              </button>
            </div>
          )
        })()}
      </Sheet>

      {/* Analytics sheet */}
      <Sheet open={!!analyticsId} onClose={() => setAnalyticsId(null)} title="Аналитика мероприятия">
        {analytics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Выручка</p>
                <p style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#10B981' }}>{Number(analytics.totalRevenue ?? 0).toLocaleString('ru')} ₽</p>
              </div>
              <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(76,215,246,0.08)', border: '1px solid rgba(76,215,246,0.2)' }}>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Гостей</p>
                <p style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#4cd7f6' }}>{analytics.attendeesCount ?? 0}{analytics.maxGuests ? ` / ${analytics.maxGuests}` : ''}</p>
              </div>
              <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)' }}>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Средний чек</p>
                <p style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#a78bfa' }}>{Math.round(analytics.avgCheckAmount ?? 0).toLocaleString('ru')} ₽</p>
              </div>
              <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Длительность</p>
                <p style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#F59E0B' }}>{analytics.durationMinutes != null ? `${Math.floor(analytics.durationMinutes / 60)}ч ${analytics.durationMinutes % 60}м` : '—'}</p>
              </div>
            </div>
            {analytics.topItems?.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Топ-5 позиций</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {analytics.topItems.map((it: any) => (
                    <div key={it.itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{it.qty} шт · {Number(it.revenue).toLocaleString('ru')} ₽</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analytics.paymentBreakdown && Object.keys(analytics.paymentBreakdown).length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Методы оплаты</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(analytics.paymentBreakdown).map(([method, total]) => (
                    <div key={method} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{method}</span>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{Number(total).toLocaleString('ru')} ₽</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
