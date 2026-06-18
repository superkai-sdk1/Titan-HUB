'use client'
import React, { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Sheet, INP, LBL } from '@/components/manage/DesignSystem'
import { useToast } from '@/components/Toast'
import { PullToRefreshContainer } from '@/components/PullToRefreshContainer'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { telLink, whatsappLink, telegramLink, openContact, mapsRouteUrl, taxiUrlFromCoords, taxiMapsFallbackUrl } from '@/lib/contact'
import { MinicapSheet } from './MinicapSheet'

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
// Метка для карточек миникапа (format='minicap'; type у него titan).
const MINICAP_LABEL: [string, string, string] = ['Миникап', 'emoji_events', '#EC4899']

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
const MONTHS_FULL = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
// 'YYYY-MM' → «Май 2026» (год добавляем всегда — прошлые годы тоже попадают в папки).
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_FULL[m] ?? ym} ${y}`
}

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
  const router = useRouter()
  const pathname = usePathname()
  // Страница рендерится и на /events (мобильный, диплинки), и на /manage/events
  // (сплит «Управления»). Внутри /manage показываем кнопку: на десктопе —
  // «закрыть раздел» (к пустому /manage), на мобильном — «назад» (к меню).
  const inManageSplit = !!pathname && pathname.startsWith('/manage')
  const [tab, setTab] = useState<'upcoming' | 'past' | 'archive'>('upcoming')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState<any>(BLANK)
  const [analyticsId, setAnalyticsId] = useState<string | null>(null)
  const [minicapOpen, setMinicapOpen] = useState(false)
  const [minicapId, setMinicapId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const openMinicap = (id: string | null) => { setSelected(null); setShowForm(false); setMinicapId(id); setMinicapOpen(true) }
  const [custResults, setCustResults] = useState<any[]>([])
  const [custFocus, setCustFocus] = useState(false)
  // Раскрытые папки прошлых месяцев в «Прошедших».
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())
  const toggleMonth = (ym: string) => setOpenMonths(s => { const n = new Set(s); n.has(ym) ? n.delete(ym) : n.add(ym); return n })

  // Координаты адреса выбранного выезда — для прямого диплинка в Яндекс Go (точка
  // назначения). Префетчим при открытии карточки, чтобы кнопка «Такси» была обычной
  // ссылкой (открытие в жесте, без блокировки попапов). Нет координат → запасной
  // вариант (Я.Карты, режим такси, по тексту адреса).
  const [taxiCoords, setTaxiCoords] = useState<{ lat: number; lon: number } | null>(null)
  useEffect(() => {
    setTaxiCoords(null)
    const addr = selected?.type === 'exit' ? String(selected?.location ?? '').trim() : ''
    if (!addr) return
    let cancelled = false
    api.get<{ lat?: number; lon?: number }>(`/geo/geocode?text=${encodeURIComponent(addr)}`)
      .then(r => { if (!cancelled && typeof r.lat === 'number' && typeof r.lon === 'number') setTaxiCoords({ lat: r.lat, lon: r.lon }) })
      .catch(() => { /* фолбэк на Я.Карты-такси */ })
    return () => { cancelled = true }
  }, [selected?.id, selected?.location, selected?.type])

  const { data } = useQuery({ queryKey: ['events'], queryFn: () => api.get<any>('/events') })
  const allEvents: any[] = data?.events ?? []

  // Брони: новые заявки (попадают сюда же, в «Мероприятия») и «Старые брони» (брони
  // пространств штаба с завершённым мероприятием).
  const { data: pendingData } = useQuery({ queryKey: ['bookings-pending'], queryFn: () => api.get<any>('/bookings?status=new'), refetchInterval: 60_000 })
  const pendingBookings: any[] = pendingData?.bookings ?? []
  const { data: archiveData } = useQuery({ queryKey: ['bookings-archive'], queryFn: () => api.get<any>('/bookings/archive') })
  const archiveBookings: any[] = archiveData?.bookings ?? []

  const sortKey = (e: any) => `${e.date ?? ''}T${e.startTime ?? '00:00'}`
  const isPast = (e: any) => e.status === 'completed' || e.status === 'cancelled'

  const upcoming = allEvents.filter(e => !isPast(e)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const past = allEvents.filter(isPast).sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
  const upcomingCount = upcoming.length

  // Прошедшие: текущий месяц — плоским списком; прошлые месяцы — в папки (чтобы не
  // было простыни). Группировка по 'YYYY-MM', сортировка папок по убыванию.
  const nowD = new Date()
  const curYM = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`
  const pastThisMonth = past.filter(e => (e.date ?? '').slice(0, 7) === curYM)
  const pastOlderGroups: { ym: string; label: string; items: any[] }[] = (() => {
    const m = new Map<string, any[]>()
    for (const e of past) {
      const ym = (e.date ?? '').slice(0, 7)
      if (!ym || ym === curYM) continue
      if (!m.has(ym)) m.set(ym, [])
      m.get(ym)!.push(e)
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([ym, items]) => ({ ym, label: monthLabel(ym), items }))
  })()

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['events'] }) }

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
  // Жёсткое удаление навсегда (для уже отменённых): убирает событие и связанную бронь.
  const purge = useMutation({
    mutationFn: (id: string) => api.delete(`/events/${id}?purge=true`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['bookings-archive'] }); qc.invalidateQueries({ queryKey: ['bookings-pending'] }); setSelected(null); show('Удалено навсегда', 'success') },
    onError: (e: any) => show(e?.message ?? 'Не удалось удалить', 'error'),
  })

  // Подтверждение заявки → создаётся мероприятие; сразу открываем редактор, чтобы
  // дозаполнить недостающее (ответственный и т.д.). Отклонение → бронь отменена.
  const confirmBooking = useMutation({
    mutationFn: (id: string) => api.patch<{ eventId: string | null }>(`/bookings/${id}`, { status: 'confirmed' }),
    onSuccess: async (r) => {
      qc.invalidateQueries({ queryKey: ['bookings-pending'] }); qc.invalidateQueries({ queryKey: ['events'] })
      show('Бронь подтверждена — создано мероприятие', 'success')
      try { if (r?.eventId) { const ev = await api.get<any>(`/events/${r.eventId}`); openEdit(ev.event) } } catch { /* */ }
    },
    onError: (e: any) => show(e?.message ?? 'Не удалось подтвердить', 'error'),
  })
  const rejectBooking = useMutation({
    mutationFn: (id: string) => api.patch(`/bookings/${id}`, { status: 'cancelled' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings-pending'] }); show('Бронь отклонена', 'success') },
    onError: (e: any) => show(e?.message ?? 'Ошибка', 'error'),
  })

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

  // Карточка мероприятия (общая для плоских списков и папок прошлых месяцев).
  const renderEventCard = (ev: any) => {
    const [statusLabel, statusColor, statusIcon] = STATUS[ev.status] ?? ['—', '#94A3B8', 'help']
    const isMini = ev.format === 'minicap'
    const [typeLabel, typeIcon, typeColor] = isMini ? MINICAP_LABEL : (TYPES[ev.type] ?? ['—', 'event', '#94A3B8'])
    const day = (ev.date ?? '').split('-')[2]
    const month = MONTHS_SHORT[Number((ev.date ?? '').split('-')[1])] ?? ''
    const responsible = staffById(ev.responsibleStaffId)
    const baseAmount = ev.billingMode === 'hourly'
      ? (ev.plannedHours ? `${ev.plannedHours} ч` : 'почасовая')
      : ev.fixedAmount != null ? `${parseFloat(ev.fixedAmount).toLocaleString('ru')} ₽`
      : ev.manualAmount != null ? `${parseFloat(ev.manualAmount).toLocaleString('ru')} ₽`
      : null
    return (
      <div key={ev.id} className="glass-l2" onClick={() => isMini ? openMinicap(ev.id) : setSelected(ev)}
        style={{ borderRadius: 16, padding: '16px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'border-color 0.2s, transform 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = `${statusColor}44`; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
        <div style={{ width: 54, height: 54, borderRadius: 14, background: `${statusColor}18`, border: `1px solid ${statusColor}33`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: statusColor, lineHeight: 1 }}>{day}</span>
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
          <button onClick={(e) => { e.stopPropagation(); isMini ? openMinicap(ev.id) : startEvent(ev) }} disabled={update.isPending}
            style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #10B981, #4cd7f6)', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0, boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}>
            <Icon name="play_arrow" size={15} />Начать
          </button>
        ) : (
          <Icon name="chevron_right" size={18} color="rgba(204,195,216,0.3)" />
        )}
      </div>
    )
  }

  const emptyState = (text: string) => (
    <div style={{ textAlign: 'center', padding: '64px 0' }}>
      <Icon name="event" size={56} color="rgba(204,195,216,0.2)" style={{ display: 'block', marginBottom: 12 }} />
      <p style={{ fontSize: 15, color: 'rgba(204,195,216,0.4)', margin: 0 }}>{text}</p>
    </div>
  )

  // Карточка брони — визуально ОТЛИЧАЕТСЯ от мероприятия (цветная рамка + бейдж).
  // Брони пространств штаба отмечаются отдельно (фиолетовый, кабинка).
  const fmtBk = (iso: string) => { try { return new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return iso } }
  const renderBookingCard = (b: any, mode: 'pending' | 'archive') => {
    const isExit = b.location === 'exit'
    const isSpace = b.location === 'titan' && !!b.space_id
    const accent = mode === 'archive' ? '#94A3B8' : isExit ? '#F59E0B' : isSpace ? '#8B5CF6' : '#EC4899'
    const tag = mode === 'archive' ? 'Старая бронь' : 'Заявка'
    return (
      <div key={b.id} style={{ borderRadius: 14, padding: 14, background: `${accent}12`, border: `1px solid ${accent}3a`, borderLeft: `3px solid ${accent}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{b.title || b.name}</span>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: accent, background: `${accent}22`, border: `1px solid ${accent}55`, borderRadius: 6, padding: '2px 7px' }}>{tag}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8, fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={isSpace ? 'location_on' : isExit ? 'local_shipping' : 'event'} size={13} /> {isExit ? 'Выезд' : 'Штаб'}{isSpace && b.zone_name ? ` · ${b.zone_name}` : ''}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="schedule" size={13} /> {fmtBk(b.starts_at)}{b.tariff_hours ? ` · ${b.tariff_hours} ч` : ''}</span>
          {b.guests != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="group" size={13} /> {b.guests}</span>}
          {isExit && b.address && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="location_on" size={13} /> {b.address}</span>}
          {b.name && (b.title ? <span>{b.name}</span> : null)}
          <a href={`tel:${b.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#a78bfa', textDecoration: 'none' }}><Icon name="call" size={13} color="#a78bfa" /> {b.phone}</a>
        </div>
        {b.comment && <p style={{ fontSize: 13, color: 'var(--on-surface)', margin: '8px 0 0', lineHeight: 1.45 }}>{b.comment}</p>}
        {mode === 'archive' && b.check_total != null && <p style={{ fontSize: 13, fontWeight: 700, margin: '8px 0 0', color: '#c4b5fd' }}>Итог вечера: {Math.round(Number(b.check_total)).toLocaleString('ru-RU')} ₽</p>}
        {mode === 'pending' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button disabled={confirmBooking.isPending} onClick={() => confirmBooking.mutate(b.id)}
              style={{ flex: 1, padding: '10px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(16,185,129,0.16)', color: '#10B981' }}>Подтвердить</button>
            <button disabled={confirmBooking.isPending} onClick={() => rejectBooking.mutate(b.id)}
              style={{ flex: 1, padding: '10px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'rgba(148,163,184,0.16)', color: 'var(--on-surface-variant)' }}>Отклонить</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%' }}>
      {/* Header — фиксированная (контент скроллится отдельно для свайп-обновления) */}
      <div style={{ flexShrink: 0, zIndex: 20, background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%' }}>
          {inManageSplit && (
            <button
              onClick={() => { if (window.matchMedia('(min-width: 1024px)').matches) router.push('/manage'); else router.back() }}
              aria-label="Закрыть раздел"
              className="events-split-close"
              style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0 }}
            >
              <span className="esc-desktop" style={{ display: 'none', lineHeight: 0 }}><Icon name="close" size={18} /></span>
              <span className="esc-mobile" style={{ lineHeight: 0 }}><Icon name="arrow_back" size={18} /></span>
              <style>{`@media (min-width: 1024px) { .esc-desktop { display: inline !important; } .esc-mobile { display: none !important; } }`}</style>
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Мероприятия</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{allEvents.length} событий{upcomingCount > 0 ? ` · ${upcomingCount} предстоящих` : ''}</p>
          </div>
          <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, minHeight: 44, border: 'none', cursor: 'pointer', background: 'var(--primary-violet)', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>
            <Icon name="add" size={18} />Добавить
          </button>
        </div>
      </div>

      {/* Контент со свайпом для обновления (под шапкой) */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <PullToRefreshContainer onRefresh={refresh}>
          <div style={{ padding: '14px 16px var(--bottom-nav-clear)', maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            {/* Переключатель (как в Складе): иконка над подписью */}
            <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
              {([['upcoming', 'Предстоящие', 'event', upcoming.length], ['past', 'Прошедшие', 'history', past.length], ['archive', 'Старые', 'folder_open', archiveBookings.length]] as [typeof tab, string, string, number][]).map(([k, l, icon, n]) => {
                const active = tab === k
                return (
                  <button key={k} onClick={() => setTab(k)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 4px', borderRadius: 11, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: active ? 'var(--primary-violet)' : 'transparent', color: active ? '#fff' : 'var(--on-surface-variant)' }}>
                    <Icon name={icon} size={19} color={active ? '#fff' : 'var(--on-surface-variant)'} />
                    <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{l} · {n}</span>
                  </button>
                )
              })}
            </div>

            {/* Предстоящие: сверху — новые заявки на бронь, затем мероприятия */}
            {tab === 'upcoming' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingBookings.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="schedule" size={14} color="#F59E0B" /> Заявки на бронь · {pendingBookings.length}
                    </div>
                    {pendingBookings.map((b) => renderBookingCard(b, 'pending'))}
                    {upcoming.length > 0 && <div style={{ height: 6 }} />}
                  </>
                )}
                {upcoming.length > 0
                  ? upcoming.map(renderEventCard)
                  : pendingBookings.length === 0 && emptyState('Предстоящих мероприятий нет')}
              </div>
            )}

            {/* Старые брони — брони пространств с завершённым вечером */}
            {tab === 'archive' && (
              archiveBookings.length === 0
                ? emptyState('Старых броней пока нет')
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{archiveBookings.map((b) => renderBookingCard(b, 'archive'))}</div>
            )}

            {/* Прошедшие: этот месяц — плоско, прошлые месяцы — папками */}
            {tab === 'past' && (
              (pastThisMonth.length === 0 && pastOlderGroups.length === 0)
                ? emptyState('Прошедших мероприятий нет')
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pastThisMonth.map(renderEventCard)}
                    {pastOlderGroups.map(g => {
                      const open = openMonths.has(g.ym)
                      return (
                        <div key={g.ym}>
                          <button onClick={() => toggleMonth(g.ym)} className="glass-l2" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: 'var(--on-surface)' }}>
                            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon name="folder_open" size={20} color="#a78bfa" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                              <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{g.label}</p>
                              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{g.items.length} событий</p>
                            </div>
                            <Icon name="expand_more" size={20} color="var(--on-surface-variant)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                          </button>
                          {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>{g.items.map(renderEventCard)}</div>}
                        </div>
                      )
                    })}
                  </div>
                )
            )}
          </div>
        </PullToRefreshContainer>
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
            {/* Миникап — отдельная форма/логика. */}
            <button onClick={() => { setShowForm(false); openMinicap(null) }}
              style={{ flex: 1, padding: '16px 12px', borderRadius: 16, border: `1.5px solid ${MINICAP_LABEL[2]}`, background: `${MINICAP_LABEL[2]}1f`, color: MINICAP_LABEL[2], cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Icon name={MINICAP_LABEL[1]} size={26} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{MINICAP_LABEL[0]}</span>
              <span style={{ fontSize: 10, opacity: 0.7, textAlign: 'center' }}>состав + взносы</span>
            </button>
          </div>

          {/* Адрес (выезд) */}
          {form.type === 'exit' && (
            <FormSection title="Адрес выезда">
              <AddressAutocomplete value={form.location} onChange={v => set({ location: v })} placeholder="Адрес или место выезда" style={INP} />
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
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
              {/* Карта и такси — только для выезда с адресом (под кнопками связи). */}
              {selected.type === 'exit' && selected.location && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <a href={mapsRouteUrl(selected.location)} target="_blank" rel="noreferrer"
                    style={{ flex: 1, padding: '10px 4px', borderRadius: 11, border: '1px solid #4cd7f644', background: '#4cd7f612', color: '#4cd7f6', fontSize: 11, fontWeight: 700, textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <Icon name="map" size={18} color="#4cd7f6" />Карта
                  </a>
                  <a href={taxiCoords ? taxiUrlFromCoords(taxiCoords.lat, taxiCoords.lon) : taxiMapsFallbackUrl(selected.location)} target="_blank" rel="noreferrer"
                    style={{ flex: 1, padding: '10px 4px', borderRadius: 11, border: '1px solid #FBBF2444', background: '#FBBF2412', color: '#FBBF24', fontSize: 11, fontWeight: 700, textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <Icon name="local_taxi" size={18} color="#FBBF24" />Такси
                  </a>
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
              {selected.status === 'cancelled' ? (
                <button onClick={() => { if (typeof window !== 'undefined' && window.confirm('Удалить навсегда? Бронь и мероприятие будут стёрты безвозвратно.')) purge.mutate(selected.id) }}
                  style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.45)', background: 'rgba(244,63,94,0.16)', color: '#F87171', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Icon name="delete" size={16} />Удалить навсегда
                </button>
              ) : (
                <button onClick={() => del.mutate(selected.id)}
                  style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#F87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Icon name="close" size={16} />Отменить мероприятие
                </button>
              )}
            </div>
          )
        })()}
      </Sheet>

      {/* Миникап — отдельная форма создания/управления */}
      <MinicapSheet open={minicapOpen} onClose={() => { setMinicapOpen(false); setMinicapId(null) }} eventId={minicapId} />

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
