'use client'
import React, { useState } from 'react'
import { Icon } from '@/components/Icon'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Sheet, INP, LBL } from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'
import { telLink, whatsappLink, telegramLink, openContact } from '@/lib/contact'

const STATUS: Record<string, [string, string, string]> = {
  planned:            ['Запланировано',     '#3B82F6', 'schedule'],
  needs_clarification:['Требуется уточнить', '#F59E0B', 'help'],
  active:             ['Активно',           '#10B981', 'play_circle'],
  completed:          ['Завершено',         '#94A3B8', 'check_circle'],
  cancelled:          ['Отменено',          '#F43F5E', 'cancel'],
}

const MANUAL_STATUSES = ['planned', 'needs_clarification', 'cancelled']

const TYPES: Record<string, [string, string, string]> = {
  titan: ['Titan клуб', 'home',            '#8B5CF6'],
  exit:  ['Выезд',      'directions_car',  '#F59E0B'],
}

const BLANK = {
  type: 'titan',
  location: '',
  spaceId: '',
  date: new Date().toISOString().split('T')[0],
  startTime: '18:00',
  endTime: '',
  billingMode: 'amount' as 'amount' | 'hourly',
  fixedAmount: '',
  plannedHours: 2,
  responsibleStaffId: '',
  customerName: '',
  customerPhone: '',
  comment: '',
}

const MONTHS_SHORT = ['', 'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: 0 }}>{title}</p>
      {children}
    </div>
  )
}

// Ручной ввод времени: два поля ЧЧ и ММ с прорисованным двоеточием между ними.
function TimeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = (value || '').split(':')
  const hh = parts[0] ?? ''
  const mm = parts[1] ?? ''
  const box: React.CSSProperties = { width: 56, textAlign: 'center', padding: '12px 6px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--on-surface)', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', outline: 'none', boxSizing: 'border-box' }
  const clampH = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 2); return d && parseInt(d) > 23 ? '23' : d }
  const clampM = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 2); return d && parseInt(d) > 59 ? '59' : d }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input inputMode="numeric" maxLength={2} placeholder="чч" value={hh} onChange={e => onChange(`${clampH(e.target.value)}:${mm}`)} style={box} />
      <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--on-surface-variant)' }}>:</span>
      <input inputMode="numeric" maxLength={2} placeholder="мм" value={mm} onChange={e => onChange(`${hh}:${clampM(e.target.value)}`)} style={box} />
    </div>
  )
}
function normTime(t: string): string {
  if (!t) return t
  const [h, m] = t.split(':')
  return `${(h || '').padStart(2, '0')}:${(m || '00').padStart(2, '0')}`
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
  const [custResults, setCustResults] = useState<any[]>([])
  const [custFocus, setCustFocus] = useState(false)

  const { data } = useQuery({ queryKey: ['events'], queryFn: () => api.get<any>('/events') })
  const allEvents: any[] = data?.events ?? []

  const sortKey = (e: any) => `${e.date ?? ''}T${e.startTime ?? '00:00'}`
  const isPast = (e: any) => e.status === 'completed' || e.status === 'cancelled'

  const upcoming = allEvents.filter(e => !isPast(e)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const past = allEvents.filter(isPast).sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
  const events = tab === 'upcoming' ? upcoming : past
  const upcomingCount = upcoming.length

  const { data: staffData } = useQuery({ queryKey: ['staff'], queryFn: () => api.get<{ staff: any[] }>('/staff') })
  const staffList: any[] = staffData?.staff ?? []
  const staffById = (id: string | null | undefined) => staffList.find(s => s.id === id)

  const { data: spacesData } = useQuery({
    queryKey: ['pos', 'spaces'],
    queryFn: () => api.get<{ spaces: any[] }>('/pos/spaces'),
    enabled: showForm,
  })
  const spacesList: any[] = spacesData?.spaces ?? []

  // Почасовые тарифы мероприятий (для режима «Почасовая»).
  const { data: ratesData } = useQuery({
    queryKey: ['pricing', 'event-rates'],
    queryFn: () => api.get<{ rates: { hours: number; price: string }[] }>('/pricing/event-rates'),
    enabled: showForm,
  })
  const eventRates: { hours: number; price: number }[] = (ratesData?.rates ?? []).map(r => ({ hours: r.hours, price: parseFloat(String(r.price)) || 0 }))
  const hourlyPrice = (h: number) => eventRates.find(r => r.hours === h)?.price ?? 0

  const { data: analytics } = useQuery({
    queryKey: ['events', 'analytics', analyticsId],
    queryFn: () => api.get<any>(`/events/${analyticsId}/analytics`),
    enabled: !!analyticsId,
  })

  const create = useMutation({
    mutationFn: (b: any) => api.post('/events', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setShowForm(false); setForm(BLANK); setEditId(null); setFormError(null) },
    onError: (err: any) => setFormError(err?.message ?? 'Ошибка сохранения'),
  })
  const saveEdit = useMutation({
    mutationFn: ({ id, ...b }: any) => api.patch(`/events/${id}`, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setShowForm(false); setForm(BLANK); setEditId(null); setFormError(null) },
    onError: (err: any) => setFormError(err?.message ?? 'Ошибка сохранения'),
  })
  const update = useMutation({
    mutationFn: ({ id, ...b }: any) => api.patch(`/events/${id}`, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) },
    onError: (err: any) => show(err?.message ?? 'Не удалось изменить статус', 'error'),
  })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/events/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) } })

  function openCreate() {
    setForm(BLANK); setEditId(null); setFormError(null); setCustResults([]); setCustFocus(false); setShowForm(true)
  }

  function openEdit(ev: any) {
    setForm({
      type: ev.type ?? 'titan',
      location: ev.location ?? '',
      spaceId: ev.spaceId ?? '',
      date: ev.date ?? new Date().toISOString().split('T')[0],
      startTime: ev.startTime ?? '18:00',
      endTime: ev.endTime ?? '',
      billingMode: ev.billingMode ?? 'amount',
      fixedAmount: ev.fixedAmount != null ? String(ev.fixedAmount) : '',
      plannedHours: ev.plannedHours ?? 2,
      responsibleStaffId: ev.responsibleStaffId ?? '',
      customerName: ev.customerName ?? '',
      customerPhone: ev.customerPhone ?? '',
      comment: ev.comment ?? '',
    })
    setEditId(ev.id); setFormError(null); setSelected(null); setCustResults([]); setCustFocus(false); setShowForm(true)
  }

  function startEvent(ev: any) { update.mutate({ id: ev.id, status: 'active' }) }

  async function searchCustomers(q: string) {
    if (!q.trim()) { setCustResults([]); return }
    try { const res = await api.get<{ customers: any[] }>(`/customers?q=${encodeURIComponent(q)}`); setCustResults(res.customers ?? []) }
    catch { setCustResults([]) }
  }
  function pickCustomer(c: any) {
    setForm((p: any) => ({ ...p, customerName: c.name ?? '', customerPhone: c.phone ?? '' }))
    setCustResults([]); setCustFocus(false)
  }

  // Существующий заказчик с точным совпадением имени → телефон уже известен, поле не показываем.
  const existingCust = form.customerName.trim()
    ? custResults.find((c: any) => (c.name ?? '').trim().toLowerCase() === form.customerName.trim().toLowerCase())
    : null
  const showPhoneField = form.customerName.trim() !== '' && !existingCust

  function submitForm() {
    setFormError(null)
    if (form.type === 'exit' && !form.responsibleStaffId) { setFormError('Для выезда укажите ответственного'); return }
    if (form.type === 'titan' && !form.customerName.trim()) { setFormError('Укажите имя заказчика'); return }
    if (form.type === 'exit' && !form.location.trim()) { setFormError('Укажите адрес выезда'); return }

    const hourly = form.billingMode === 'hourly'
    const phone = existingCust ? (existingCust.phone ?? null) : (form.customerPhone || null)
    const payload: any = {
      type: form.type,
      // Название = имя заказчика (titan) или адрес (выезд).
      title: form.type === 'titan' ? (form.customerName.trim() || null) : (form.location.trim() || null),
      location: form.type === 'exit' ? (form.location.trim() || null) : null,
      spaceId: form.type === 'titan' ? (form.spaceId || null) : null,
      date: form.date,
      startTime: normTime(form.startTime),
      endTime: form.endTime ? normTime(form.endTime) : null,
      paymentType: 'fixed',
      billingMode: hourly ? 'hourly' : 'amount',
      responsibleStaffId: form.responsibleStaffId || null,
      customerName: form.customerName.trim() || null,
      customerPhone: phone,
      comment: form.comment || null,
      fixedAmount: !hourly && form.fixedAmount ? parseFloat(form.fixedAmount) : null,
      plannedHours: hourly ? Number(form.plannedHours) : null,
    }
    if (editId) saveEdit.mutate({ id: editId, ...payload })
    else create.mutate(payload)
  }

  const saving = create.isPending || saveEdit.isPending
  const set = (patch: any) => setForm((p: any) => ({ ...p, ...patch }))

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflowX: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 680, margin: '0 auto', width: '100%' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Мероприятия</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{events.length} событий{upcomingCount > 0 ? ` · ${upcomingCount} предстоящих` : ''}</p>
          </div>
          <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}>
            <Icon name="add" size={18} />Добавить
          </button>
        </div>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', maxWidth: 680, margin: '12px auto 0', width: '100%' }}>
          {([['upcoming', 'Предстоящие', upcoming.length], ['past', 'Прошедшие', past.length]] as [typeof tab, string, number][]).map(([k, l, n]) => (
            <button key={k} onClick={() => setTab(k)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: tab === k ? '2px solid #8B5CF6' : '2px solid transparent', color: tab === k ? '#8B5CF6' : 'var(--on-surface-variant)', fontSize: 13, fontWeight: tab === k ? 700 : 500, transition: 'all 0.2s', marginBottom: -1, whiteSpace: 'nowrap' }}>
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
            <p style={{ fontSize: 15, color: 'rgba(204,195,216,0.4)', margin: 0 }}>{tab === 'upcoming' ? 'Предстоящих мероприятий нет' : 'Прошедших мероприятий нет'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map((ev: any) => {
              const [statusLabel, statusColor, statusIcon] = STATUS[ev.status] ?? ['—', '#94A3B8', 'help']
              const [typeLabel, typeIcon, typeColor] = TYPES[ev.type] ?? ['—', 'event', '#94A3B8']
              const day = ev.date.split('-')[2]
              const month = MONTHS_SHORT[Number(ev.date.split('-')[1])] ?? ''
              const responsible = staffById(ev.responsibleStaffId)
              const baseAmount = ev.billingMode === 'hourly'
                ? (ev.plannedHours ? `${ev.plannedHours} ч` : 'почасовая')
                : ev.fixedAmount != null
                ? `${parseFloat(ev.fixedAmount).toLocaleString('ru')} ₽`
                : ev.manualAmount != null
                ? `${parseFloat(ev.manualAmount).toLocaleString('ru')} ₽`
                : null
              return (
                <div key={ev.id} className="glass-l2" onClick={() => setSelected(ev)}
                  style={{ borderRadius: 16, padding: '16px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'border-color 0.2s, transform 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${statusColor}44`; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
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
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 3px' }}>
                      {ev.startTime}{ev.endTime ? ` — ${ev.endTime}` : ''}{baseAmount ? ` · ${baseAmount}` : ''}
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
                    <button onClick={(e) => { e.stopPropagation(); startEvent(ev) }} disabled={update.isPending}
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

          {/* Тип */}
          <div style={{ display: 'flex', gap: 10 }}>
            {Object.entries(TYPES).map(([k, [l, icon, c]]) => {
              const active = form.type === k
              return (
                <button key={k} onClick={() => set({ type: k })}
                  style={{ flex: 1, padding: '16px 12px', borderRadius: 16, border: `1.5px solid ${active ? c : 'rgba(255,255,255,0.1)'}`, background: active ? `${c}1f` : 'rgba(255,255,255,0.03)', color: active ? c : 'var(--on-surface-variant)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all 0.15s', boxShadow: active ? `0 0 18px ${c}25` : 'none' }}>
                  <Icon name={icon} size={26} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{l}</span>
                  <span style={{ fontSize: 10, opacity: 0.7, textAlign: 'center' }}>{k === 'titan' ? 'в клубе, с зоной' : 'на выезде'}</span>
                </button>
              )
            })}
          </div>

          {/* Адрес (выезд) */}
          {form.type === 'exit' && (
            <FormSection title="Адрес выезда">
              <input value={form.location} onChange={e => set({ location: e.target.value })} placeholder="Адрес или место выезда" style={INP} />
            </FormSection>
          )}

          {/* Заказчик — одно поле «Имя» с автоподбором; телефон только для нового */}
          <FormSection title="Заказчик">
            <div style={{ position: 'relative' }}>
              <label style={LBL}>Имя заказчика</label>
              <input
                value={form.customerName}
                onChange={e => { set({ customerName: e.target.value, customerPhone: '' }); searchCustomers(e.target.value) }}
                onFocus={() => setCustFocus(true)}
                onBlur={() => setTimeout(() => setCustFocus(false), 150)}
                placeholder="Имя контактного лица" style={INP}
              />
              {custFocus && custResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'rgba(29,26,36,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  {custResults.map((c) => (
                    <button key={c.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => pickCustomer(c)}
                      style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--on-surface)', fontSize: 14 }}>
                      <Icon name="person" size={16} color="#a78bfa" />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Без имени'}</span>
                      {c.phone && <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {existingCust && existingCust.phone && (
              <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check_circle" size={14} color="#34D399" />Заказчик найден · {existingCust.phone}
              </p>
            )}
            {showPhoneField && (
              <div>
                <label style={LBL}>Телефон (новый заказчик)</label>
                <input type="tel" inputMode="tel" value={form.customerPhone} onChange={e => set({ customerPhone: e.target.value })} placeholder="+7 900 000-00-00" style={INP} />
              </div>
            )}
          </FormSection>

          {/* Пространство — 4 кнопки в ряд (titan) */}
          {form.type === 'titan' && spacesList.length > 0 && (
            <FormSection title="Пространство">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {spacesList.map((s) => {
                  const active = form.spaceId === s.id
                  return (
                    <button key={s.id} onClick={() => set({ spaceId: active ? '' : s.id })}
                      style={{ padding: '12px 6px', borderRadius: 12, minHeight: 56, border: `1.5px solid ${active ? '#8B5CF6' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)', color: active ? '#a78bfa' : 'var(--on-surface)', fontSize: 11, fontWeight: 600, cursor: 'pointer', lineHeight: 1.2, textAlign: 'center' }}>
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </FormSection>
          )}

          {/* Ответственный — кнопки в ряд */}
          <FormSection title={`Ответственный${form.type === 'exit' ? ' *' : ''}`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {staffList.map((s) => {
                const active = form.responsibleStaffId === s.id
                return (
                  <button key={s.id} onClick={() => set({ responsibleStaffId: active ? '' : s.id })}
                    style={{ padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${active ? '#8B5CF6' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)', color: active ? '#a78bfa' : 'var(--on-surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="person" size={15} />{s.nickname}
                  </button>
                )
              })}
            </div>
          </FormSection>

          {/* Дата и время */}
          <FormSection title="Дата и время">
            <div><label style={LBL}>Дата</label><input type="date" value={form.date} onChange={e => set({ date: e.target.value })} style={INP} /></div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div><label style={LBL}>Начало</label><TimeBoxes value={form.startTime} onChange={v => set({ startTime: v })} /></div>
              <div><label style={LBL}>Конец</label><TimeBoxes value={form.endTime} onChange={v => set({ endTime: v })} /></div>
            </div>
          </FormSection>

          {/* Оплата — Фикс / Почасовая */}
          <FormSection title="Оплата">
            <div style={{ display: 'flex', gap: 8 }}>
              {([['amount', 'Фикс', 'sell'], ['hourly', 'Почасовая', 'schedule']] as [string, string, string][]).map(([k, l, icon]) => {
                const active = form.billingMode === k
                return (
                  <button key={k} onClick={() => set({ billingMode: k })}
                    style={{ flex: 1, padding: '13px 8px', borderRadius: 12, border: `1.5px solid ${active ? '#8B5CF6' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: active ? '#a78bfa' : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Icon name={icon} size={16} />{l}
                  </button>
                )
              })}
            </div>

            {form.billingMode === 'amount' ? (
              <div><label style={LBL}>Сумма (₽)</label><input type="number" inputMode="numeric" value={form.fixedAmount} onChange={e => set({ fixedAmount: e.target.value })} placeholder="0" style={INP} /></div>
            ) : (
              <div>
                <label style={LBL}>Планируемое время</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {(eventRates.length ? eventRates : [1, 2, 3, 4, 5, 6].map(h => ({ hours: h, price: 0 }))).map(r => {
                    const active = Number(form.plannedHours) === r.hours
                    return (
                      <button key={r.hours} onClick={() => set({ plannedHours: r.hours })}
                        style={{ padding: '12px 6px', borderRadius: 12, border: `1.5px solid ${active ? '#8B5CF6' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)', color: active ? '#a78bfa' : 'var(--on-surface)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{r.hours} ч</span>
                        <span style={{ fontSize: 11, color: active ? '#a78bfa' : 'var(--on-surface-variant)' }}>{r.price.toLocaleString('ru')} ₽</span>
                      </button>
                    )
                  })}
                </div>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="payments" size={15} color="#a78bfa" />Основа чека: <strong style={{ color: 'var(--on-surface)' }}>{hourlyPrice(Number(form.plannedHours)).toLocaleString('ru')} ₽</strong>
                </p>
              </div>
            )}
          </FormSection>

          {/* Комментарий */}
          <FormSection title="Комментарий">
            <input value={form.comment} onChange={e => set({ comment: e.target.value })} placeholder="Необязательно" style={INP} />
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
          const amountLabel = selected.billingMode === 'hourly'
            ? `${selected.plannedHours ?? '—'} ч`
            : selected.fixedAmount != null ? `${parseFloat(selected.fixedAmount).toLocaleString('ru')} ₽`
            : selected.manualAmount != null ? `${parseFloat(selected.manualAmount).toLocaleString('ru')} ₽` : '—'
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
                  selected.type === 'exit' ? ['Адрес', selected.location || '—'] : null,
                  ['Ответственный', staffById(selected.responsibleStaffId)?.nickname || '—'],
                  ['Оплата', selected.billingMode === 'hourly' ? 'Почасовая' : 'Фикс'],
                  ['Сумма / время', amountLabel],
                  ['Комментарий', selected.comment || '—'],
                ].filter(Boolean).map((row) => { const [k, v] = row as [string, string]; return v && v !== '—' ? (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{k}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)' }}>{v}</span>
                  </div>
                ) : null })}
              </div>
              {(selected.customerName || selected.customerPhone) && (
                <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Заказчик</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: selected.customerPhone ? 12 : 0 }}>
                    <Icon name="person" size={16} color="#a78bfa" />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{selected.customerName || 'Без имени'}</span>
                    {selected.customerPhone && <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{selected.customerPhone}</span>}
                  </div>
                  {selected.customerPhone && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {([
                        ['call', 'Позвонить', '#10B981', telLink(selected.customerPhone)],
                        ['whatsapp', 'WhatsApp', '#25D366', whatsappLink(selected.customerPhone)],
                        ['telegram', 'Telegram', '#229ED9', telegramLink(selected.customerPhone)],
                      ] as [string, string, string, string][]).map(([icon, label, color, url]) => (
                        <button key={icon} onClick={() => openContact(url)}
                          style={{ flex: 1, padding: '10px 4px', borderRadius: 11, border: `1px solid ${color}44`, background: `${color}12`, color, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                          <Icon name={icon} size={18} />{label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
                <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Изменить статус</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {MANUAL_STATUSES.filter((k) => k !== selected.status).map((k) => {
                    const [l, c] = STATUS[k]
                    return (
                      <button key={k} onClick={() => update.mutate({ id: selected.id, status: k })}
                        style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${c}44`, background: `${c}11`, color: c, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
                    )
                  })}
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
                <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Чеков</p>
                <p style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#4cd7f6' }}>{analytics.attendeesCount ?? 0}</p>
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
          </div>
        )}
      </Sheet>
    </div>
  )
}
